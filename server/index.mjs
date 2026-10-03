import 'dotenv/config'
import express from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto'
import XLSX from 'xlsx'
import { Int32, MongoClient } from 'mongodb'
import { createWorkbookStore } from './workbook.mjs'

// The Cloudinary package parses CLOUDINARY_URL during import and throws before the
// API can start when a partially entered value is present. Validate first so the
// optional profile-photo feature is disabled cleanly while the Command Centre and
// workbook API remain available.
const cloudinaryUrlPattern = /^cloudinary:\/\/[^:@/\s]+:[^@/\s]+@[^@/\s]+$/
if (process.env.CLOUDINARY_URL && !cloudinaryUrlPattern.test(process.env.CLOUDINARY_URL)) {
  console.warn('CLOUDINARY_URL is invalid; profile photo uploads are disabled until it is corrected. Expected form: cloudinary://API_KEY:API_SECRET@CLOUD_NAME')
  delete process.env.CLOUDINARY_URL
}
const { v2: cloudinary } = await import('cloudinary')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const app = express()
const port = Number(process.env.PORT || 8000)
const workbookPath = path.resolve(projectRoot, process.env.QAQC_EXCEL_PATH || 'data/QAQC_Master.xlsx')
const standardsPath = path.resolve(projectRoot, process.env.QAQC_STANDARDS_INDEX || 'data/dep_standards_index.csv')
const localStorePath = path.resolve(process.env.LOCAL_AUTH_STORE || path.join(projectRoot, 'data/local-users.json'))
const workbook = createWorkbookStore(workbookPath)
const mongoClient = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null
const sessions = new Map()
const loginAttempts = new Map()
const iterations = 310000
const dummyAuthUser = { salt: 'qaqc-invalid-account-timing-salt', passwordHash: '0'.repeat(64) }
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

app.disable('x-powered-by')
app.use(express.json({ limit: '256kb', strict: true }))
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  const allowed = new Set(String(process.env.APP_ORIGIN || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean))
  const origin = String(request.headers.origin || '')
  if (origin && allowed.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
  } else if (origin) return response.sendStatus(403)
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  if (request.method === 'OPTIONS') return response.sendStatus(204)
  next()
})

function readJsonStore() {
  try { return JSON.parse(fs.readFileSync(localStorePath, 'utf8')) } catch { return { users: [], resetRequests: [] } }
}
function writeJsonStore(store) {
  fs.mkdirSync(path.dirname(localStorePath), { recursive: true })
  fs.writeFileSync(localStorePath, JSON.stringify(store, null, 2), { mode: 0o600 })
}
function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha512').toString('hex')
  return { salt, hash, passwordHash: hash, password: hash, password_iterations: mongoClient ? new Int32(iterations) : iterations }
}
function storageInteger(value) {
  return mongoClient ? new Int32(value) : value
}
function newUser({ email, displayName, role = 'viewer', status = 'pending', password, discipline = 'Quality Management' }) {
  const credentials = hashPassword(password)
  const now = new Date().toISOString()
  return {
    id: randomBytes(16).toString('hex'),
    username: email,
    email,
    name: displayName,
    displayName,
    role,
    status,
    discipline,
    failed_attempts: storageInteger(0),
    locked_until: null,
    ...credentials,
    created_at: now,
    createdAt: now,
  }
}
function userId(user) {
  return user.id || user.username || user.email
}
function userLookup(id) {
  return { $or: [{ id }, { username: id }, { email: id }] }
}
function signedProfilePhotoUrl(asset) {
  if (!asset?.public_id || !process.env.CLOUDINARY_URL) return ''
  try {
    cloudinary.config({ secure: true })
    return cloudinary.url(asset.public_id, { secure: true, type: 'authenticated', resource_type: 'image', sign_url: true })
  } catch {
    return ''
  }
}
function verifyPassword(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt).hash, 'hex')
  const stored = Buffer.from(user.passwordHash || user.password, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}
function publicUser(user) {
  return {
    id: userId(user),
    email: user.email,
    displayName: user.displayName || user.name || user.email,
    discipline: user.discipline || '',
    role: user.role,
    status: user.status,
    profilePhoto: user.profile_photo_asset || null,
    profilePhotoUrl: signedProfilePhotoUrl(user.profile_photo_asset),
  }
}
function tokenFor(user) {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, { userId: userId(user), expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
  return token
}
async function collection(name) {
  if (!mongoClient) return null
  await mongoClient.connect()
  return mongoClient.db(process.env.MONGODB_DATABASE || 'qaqc_dashboard').collection(name)
}
async function findUser(email) {
  const users = await collection('users')
  if (users) return users.findOne({ email: email.toLowerCase() })
  return readJsonStore().users.find(user => user.email === email.toLowerCase()) || null
}
async function saveUser(user) {
  const users = await collection('users')
  if (users) return users.insertOne(user)
  const store = readJsonStore(); store.users = store.users.filter(item => item.email !== user.email); store.users.push(user); writeJsonStore(store)
}

async function ensureBootstrapAdmin() {
  const email = String(process.env.QAQC_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = String(process.env.QAQC_BOOTSTRAP_ADMIN_PASSWORD || '')
  if (!email || password.length < 8) return

  const users = await collection('users')
  const existing = await findUser(email)
  if (users) {
    if (existing) {
      await users.updateOne({ email }, { $set: { username: existing.username || email, name: existing.name || 'System Administrator', displayName: existing.displayName || existing.name || 'System Administrator', discipline: existing.discipline || 'Quality Management', failed_attempts: storageInteger(0), locked_until: null, role: 'admin', status: 'approved', ...hashPassword(password) } })
      return
    }
    await users.insertOne(newUser({ email, displayName: 'System Administrator', role: 'admin', status: 'approved', password }))
    return
  }

  const store = readJsonStore()
  const localUser = store.users.find(user => user.email === email)
  if (localUser) {
    localUser.role = 'admin'
    localUser.status = 'approved'
  } else {
    store.users.push(newUser({ email, displayName: 'System Administrator', role: 'admin', status: 'approved', password }))
  }
  writeJsonStore(store)
}
async function authenticate(request, response, next) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const session = sessions.get(token)
  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(token)
    return response.status(401).json({ error: 'Authentication required.' })
  }
  const users = await collection('users')
  const user = users ? await users.findOne(userLookup(session.userId)) : readJsonStore().users.find(item => userId(item) === session.userId)
  if (!user || user.status !== 'approved') return response.status(403).json({ error: 'Account approval is required.' })
  request.user = user; request.sessionToken = token; next()
}
async function requireAdmin(request, response, next) {
  await authenticate(request, response, () => {
    if (!['admin', 'super_admin'].includes(request.user.role)) return response.status(403).json({ error: 'Administrator access required.' })
    next()
  })
}
async function recordActivity({ action, category = 'general', request, target = '', status = 'success', details = {} }) {
  const logs = await collection('activity_log')
  const document = {
    event_id: randomBytes(16).toString('hex'),
    occurred_at: new Date().toISOString(),
    username: request?.user?.username || request?.user?.email || 'anonymous',
    name: request?.user?.name || request?.user?.displayName || 'Anonymous',
    email: request?.user?.email || '',
    role: request?.user?.role || 'anonymous',
    action,
    category,
    page: 'QA/QC Command Centre',
    target,
    status,
    details,
    cloud_archive_status: 'pending',
  }
  if (logs) await logs.insertOne(document)
  else { const store = readJsonStore(); store.activityLog = [...(store.activityLog || []), document]; writeJsonStore(store) }
}
function readStandards() {
  const workbookFile = XLSX.read(fs.readFileSync(standardsPath, 'utf8'), { type: 'string', raw: false })
  return XLSX.utils.sheet_to_json(workbookFile.Sheets[workbookFile.SheetNames[0]], { defval: '' })
}

app.get('/health', (_request, response) => {
  try { response.json({ ok: true, service: 'evomec-qaqc-api', auth: 'local', workbook: workbook.info() }) }
  catch (error) { response.json({ ok: false, service: 'evomec-qaqc-api', auth: 'local', error: error.message }) }
})
app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase(); const password = String(request.body.password || '')
  const now = Date.now()
  for (const [key, attempt] of loginAttempts) if (attempt.resetAt <= now) loginAttempts.delete(key)
  const attemptKeys = [request.ip, `${request.ip}\u0000${email}`]
  if (attemptKeys.some(key => (loginAttempts.get(key)?.count || 0) >= 5)) return response.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' })
  const user = await findUser(email)
  const passwordMatches = verifyPassword(password, user || dummyAuthUser)
  if (!user || user.status !== 'approved' || !passwordMatches) {
    for (const key of attemptKeys) {
      const current = loginAttempts.get(key)
      loginAttempts.set(key, { count: (current?.count || 0) + 1, resetAt: current?.resetAt > now ? current.resetAt : now + 15 * 60 * 1000 })
    }
    return response.status(401).json({ error: 'Invalid credentials or account not approved.' })
  }
  for (const key of attemptKeys) loginAttempts.delete(key)
  const token = tokenFor(user)
  await recordActivity({ action: 'sign_in', category: 'authentication', request: { user }, status: 'success' })
  response.json({ token, user: publicUser(user) })
})
app.post('/api/auth/request-access', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase(); const displayName = String(request.body.displayName || '').trim(); const password = String(request.body.password || '')
  if (!email || !displayName || password.length < 8) return response.status(400).json({ error: 'Name, email, and a password of at least 8 characters are required.' })
  if (await findUser(email)) return response.status(409).json({ error: 'An account already exists for this email.' })
  await saveUser(newUser({ email, displayName, password }))
  response.status(201).json({ message: 'Access request submitted for administrator review.' })
})
app.post('/api/auth/password-reset', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase(); const user = await findUser(email)
  if (user && !mongoClient) { const store = readJsonStore(); store.resetRequests = [...(store.resetRequests || []), { email, requestedAt: new Date().toISOString() }]; writeJsonStore(store) }
  response.json({ message: 'If the account exists, reset instructions will be issued by the configured server mailer.' })
})
app.post('/api/auth/logout', authenticate, (request, response) => { sessions.delete(request.sessionToken); response.json({ ok: true }) })
app.get('/api/profile', authenticate, async (request, response) => {
  response.json(publicUser(request.user))
})
app.patch('/api/profile', authenticate, async (request, response) => {
  const displayName = String(request.body?.displayName || '').trim()
  const discipline = String(request.body?.discipline || '').trim()
  if (!displayName) return response.status(400).json({ error: 'A display name is required.' })
  const updates = { displayName, name: displayName, discipline }
  const users = await collection('users')
  if (users) await users.updateOne(userLookup(userId(request.user)), { $set: updates })
  else {
    const store = readJsonStore()
    const index = store.users.findIndex(item => userId(item) === userId(request.user))
    if (index < 0) return response.status(404).json({ error: 'User not found.' })
    store.users[index] = { ...store.users[index], ...updates }
    writeJsonStore(store)
  }
  const user = { ...request.user, ...updates }
  await recordActivity({ action: 'update_profile', category: 'account', request: { ...request, user } })
  response.json(publicUser(user))
})
app.post('/api/profile/photo', authenticate, upload.single('photo'), async (request, response) => {
  if (!request.file) return response.status(400).json({ error: 'A profile photo is required.' })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(request.file.mimetype)) return response.status(400).json({ error: 'Only JPG, PNG, or WebP images are allowed.' })
  if (!process.env.CLOUDINARY_URL) return response.status(503).json({ error: 'Profile photos are unavailable until CLOUDINARY_URL uses the form cloudinary://API_KEY:API_SECRET@CLOUD_NAME.' })
  try {
    cloudinary.config({ secure: true })
    const username = String(request.user.username || request.user.email).replace(/[^a-zA-Z0-9_-]/g, '-')
    const folder = process.env.CLOUDINARY_FOLDER || 'qaqc-command-centre'
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder: `${folder}/profile-photos`, public_id: `${username}-${randomBytes(6).toString('hex')}`, resource_type: 'image', type: 'authenticated' }, (error, value) => error ? reject(error) : resolve(value))
      stream.end(request.file.buffer)
    })
    const asset = { public_id: result.public_id, resource_type: result.resource_type, format: result.format, bytes: result.bytes, uploaded_at: new Date().toISOString() }
    const users = await collection('users')
    if (users) await users.updateOne(userLookup(userId(request.user)), { $set: { profile_photo_asset: asset } })
    else {
      const store = readJsonStore()
      const index = store.users.findIndex(item => userId(item) === userId(request.user))
      if (index >= 0) {
        store.users[index].profile_photo_asset = asset
        writeJsonStore(store)
      }
    }
    await recordActivity({ action: 'upload_profile_photo', category: 'account', request, target: asset.public_id })
    response.json({ profilePhoto: asset, profilePhotoUrl: signedProfilePhotoUrl(asset) })
  } catch (error) {
    response.status(502).json({ error: `Profile photo upload failed: ${error instanceof Error ? error.message : 'Cloudinary error'}` })
  }
})
app.patch('/api/admin/users/:username', requireAdmin, async (request, response) => {
  const { role, status } = request.body || {}
  if (!['admin', 'user', 'viewer'].includes(role) || !['pending', 'approved', 'restricted', 'rejected'].includes(status)) return response.status(400).json({ error: 'Invalid role or access status.' })
  const users = await collection('users')
  if (users) {
    const result = await users.updateOne(userLookup(request.params.username), { $set: { role, status } })
    if (!result.matchedCount) return response.status(404).json({ error: 'User not found.' })
  } else {
    const store = readJsonStore()
    const index = store.users.findIndex(item => userId(item) === request.params.username)
    if (index < 0) return response.status(404).json({ error: 'User not found.' })
    store.users[index] = { ...store.users[index], role, status }
    writeJsonStore(store)
  }
  await recordActivity({ action: 'update_user_access', category: 'administration', request, target: request.params.username, details: { role, status } })
  response.json({ ok: true })
})
app.post('/api/support/tickets', authenticate, async (request, response) => {
  const { subject, category, message } = request.body || {}
  if (!subject || !category || !message || String(message).trim().length < 10) return response.status(400).json({ error: 'Subject, category, and a message of at least 10 characters are required.' })
  const ticket = { ticket_id: `SUP-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex').toUpperCase()}`, username: request.user.username || request.user.email, email: request.user.email, subject: String(subject).trim(), category, message: String(message).trim(), status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), escalated: false, messages: [{ sender: request.user.username || request.user.email, sender_role: request.user.role === 'admin' ? 'admin' : 'user', message: String(message).trim(), created_at: new Date().toISOString() }] }
  const tickets = await collection('support_tickets')
  if (tickets) await tickets.insertOne(ticket)
  else { const store = readJsonStore(); store.supportTickets = [...(store.supportTickets || []), ticket]; writeJsonStore(store) }
  await recordActivity({ action: 'create_support_ticket', category: 'support', request, target: ticket.ticket_id })
  response.status(201).json(ticket)
})
app.get('/api/support/tickets', authenticate, async (request, response) => {
  const tickets = await collection('support_tickets')
  const query = ['admin', 'super_admin'].includes(request.user.role) ? {} : { username: request.user.username || request.user.email }
  response.json(tickets ? await tickets.find(query, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(500).toArray() : readJsonStore().supportTickets?.filter(ticket => !query.username || ticket.username === query.username) || [])
})
app.get('/api/projects', authenticate, (_request, response) => { try { response.json(workbook.projects()) } catch (error) { response.status(500).json({ error: error.message }) } })
app.get('/api/summary', authenticate, (request, response) => { try { response.json(workbook.summary(String(request.query.project || 'All Projects'))) } catch (error) { response.status(500).json({ error: error.message }) } })
app.get('/api/record-fields', authenticate, (request, response) => {
  try {
    const module = String(request.query.module || '')
    response.json(workbook.fieldsForModule(module))
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})
app.get('/api/records', authenticate, (request, response) => { try { const moduleName = String(request.query.module || ''); const project = String(request.query.project || 'All Projects'); const rows = workbook.rowsForModule(moduleName); response.json(moduleName === 'KPI KRA Register' ? workbook.filterKpiProject(rows, project) : workbook.filterProject(rows, project)) } catch (error) { response.status(500).json({ error: error.message }) } })
app.post('/api/records', requireAdmin, async (request, response) => {
  try {
    const module = String(request.body?.module || '')
    const result = workbook.addRecord({ module, record: request.body?.record })
    await recordActivity({ action: 'create_workbook_record', category: 'workbook', request, target: `${result.sheetName}:${result.rowNumber}`, details: { module, fields: result.fields } })
    response.status(201).json({ ok: true, record: result })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to add the workbook record.' })
  }
})
app.patch('/api/records/:sheetName/:rowNumber', requireAdmin, async (request, response) => {
  try {
    const rowNumber = Number(request.params.rowNumber)
    const module = String(request.body?.module || '')
    const result = workbook.updateRecord({ module, sheetName: request.params.sheetName, rowNumber, record: request.body?.record })
    await recordActivity({ action: 'update_workbook_record', category: 'workbook', request, target: `${result.sheetName}:${result.rowNumber}`, details: { module, fields: result.fields } })
    response.json({ ok: true, record: result })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update the workbook record.' })
  }
})
app.patch('/api/records/:sheetName/:rowNumber/date', requireAdmin, async (request, response) => {
  try {
    const rowNumber = Number(request.params.rowNumber)
    const { field, value } = request.body || {}
    const updated = workbook.updateDate({ sheetName: request.params.sheetName, rowNumber, field: String(field || ''), value: String(value || '') })
    await recordActivity({ action: 'update_workbook_date', category: 'workbook', request, target: `${updated.sheetName}:${updated.rowNumber}`, details: { field: updated.field, value: updated.value } })
    response.json({ ok: true, record: updated })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update the workbook date.' })
  }
})
app.get('/api/standards', authenticate, (request, response) => { try { const query = String(request.query.query || '').toLowerCase(); response.json(readStandards().filter(row => !query || Object.values(row).some(value => String(value).toLowerCase().includes(query)))) } catch (error) { response.status(500).json({ error: error.message }) } })
app.get('/api/assets/:assetId', authenticate, (request, response) => {
  if (!process.env.CLOUDINARY_URL) return response.status(503).json({ error: 'Cloudinary is not configured on the API.' })
  const url = signedProfilePhotoUrl({ public_id: request.params.assetId })
  if (!url) return response.status(502).json({ error: 'Unable to create a secure Cloudinary URL.' })
  response.json({ url })
})
app.get('/api/admin/users', requireAdmin, async (_request, response) => { const users = await collection('users'); if (!users) return response.json(readJsonStore().users.map(publicUser)); response.json(await users.find({}, { projection: { passwordHash: 0, salt: 0 } }).limit(500).toArray()) })
app.get('/api/admin/activity', requireAdmin, async (_request, response) => { const logs = await collection('activity_log'); response.json(logs ? await logs.find({}, { projection: { _id: 0 } }).sort({ occurred_at: -1 }).limit(500).toArray() : readJsonStore().activityLog || []) })
app.get('/api/admin/support-tickets', requireAdmin, async (_request, response) => { const tickets = await collection('support_tickets'); response.json(tickets ? await tickets.find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(500).toArray() : readJsonStore().supportTickets || []) })

app.use((error, _request, response, _next) => {
  console.error('API request failed:', error instanceof Error ? error.message : error)
  if (response.headersSent) return
  response.status(500).json({ error: 'The QA/QC API could not complete this request. Check the API log for details.' })
})

ensureBootstrapAdmin()
  .then(() => app.listen(port, () => console.log(`Evomec QA/QC API listening on http://localhost:${port}`)))
  .catch(error => {
    console.error('Bootstrap admin initialization failed:', error instanceof Error ? error.message : error)
    app.listen(port, () => console.log(`Evomec QA/QC API listening on http://localhost:${port}`))
  })

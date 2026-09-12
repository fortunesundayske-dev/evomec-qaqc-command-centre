import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto'
import XLSX from 'xlsx'
import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 8000)
const workbookPath = path.resolve(process.env.QAQC_EXCEL_PATH || path.join(__dirname, '../../QAQC_Dashboard/data/QAQC_Master.xlsx'))
const standardsPath = path.resolve(process.env.QAQC_STANDARDS_INDEX || path.join(__dirname, '../../QAQC_Dashboard/data/dep_standards_index.csv'))
const localStorePath = path.resolve(process.env.LOCAL_AUTH_STORE || path.join(__dirname, '../data/local-users.json'))
const mongoClient = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null
const sessions = new Map()
const iterations = 310000

app.use(express.json())
app.use((_request, response, next) => {
  const origin = process.env.APP_ORIGIN || 'http://localhost:5173'
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (_request.method === 'OPTIONS') return response.sendStatus(204)
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
  return { salt, hash, passwordHash: hash, password: hash, iterations, password_iterations: iterations }
}
function verifyPassword(password, user) {
  const candidate = Buffer.from(hashPassword(password, user.salt).hash, 'hex')
  const stored = Buffer.from(user.passwordHash || user.password, 'hex')
  return candidate.length === stored.length && timingSafeEqual(candidate, stored)
}
function publicUser(user) {
  return { id: user.id || user.username, email: user.email, displayName: user.displayName || user.name, role: user.role, status: user.status }
}
function tokenFor(user) {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, { userId: user.id || user.username, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
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
      await users.updateOne({ email }, { $set: { username: existing.username || email.split('@')[0], name: existing.name || 'System Administrator', discipline: existing.discipline || 'Quality Management', failed_attempts: 0, locked_until: null, role: 'admin', status: 'approved', ...hashPassword(password) } })
      return
    }
    await users.insertOne({ username: email.split('@')[0], email, name: 'System Administrator', role: 'admin', status: 'approved', discipline: 'Quality Management', failed_attempts: 0, locked_until: null, ...hashPassword(password), created_at: new Date().toISOString() })
    return
  }

  const store = readJsonStore()
  const localUser = store.users.find(user => user.email === email)
  if (localUser) {
    localUser.role = 'admin'
    localUser.status = 'approved'
  } else {
    store.users.push({ id: randomBytes(16).toString('hex'), email, displayName: 'System Administrator', role: 'admin', status: 'approved', ...hashPassword(password), createdAt: new Date().toISOString() })
  }
  writeJsonStore(store)
}
async function authenticate(request, response, next) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const session = sessions.get(token)
  if (!session || session.expiresAt < Date.now()) return response.status(401).json({ error: 'Authentication required.' })
  const users = await collection('users')
  const user = users ? await users.findOne({ $or: [{ id: session.userId }, { username: session.userId }] }) : readJsonStore().users.find(item => item.id === session.userId)
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
function readWorkbook() {
  const workbook = XLSX.readFile(workbookPath)
  return Object.fromEntries(workbook.SheetNames.map(sheet => [sheet, XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null })]))
}
function readStandards() {
  const workbook = XLSX.read(fs.readFileSync(standardsPath, 'utf8'), { type: 'string', raw: false })
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
}

app.get('/health', (_request, response) => response.json({ ok: true, service: 'evomec-qaqc-api', auth: 'local' }))
app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase(); const password = String(request.body.password || '')
  const user = await findUser(email)
  if (!user || user.status !== 'approved' || !verifyPassword(password, user)) return response.status(401).json({ error: 'Invalid credentials or account not approved.' })
  const token = tokenFor(user)
  await recordActivity({ action: 'sign_in', category: 'authentication', request: { user }, status: 'success' })
  response.json({ token, user: publicUser(user) })
})
app.post('/api/auth/request-access', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase(); const displayName = String(request.body.displayName || '').trim(); const password = String(request.body.password || '')
  if (!email || !displayName || password.length < 8) return response.status(400).json({ error: 'Name, email, and a password of at least 8 characters are required.' })
  if (await findUser(email)) return response.status(409).json({ error: 'An account already exists for this email.' })
  const credentials = hashPassword(password)
  await saveUser({ id: randomBytes(16).toString('hex'), email, displayName, role: 'viewer', status: 'pending', ...credentials, createdAt: new Date().toISOString() })
  response.status(201).json({ message: 'Access request submitted for administrator review.' })
})
app.post('/api/auth/password-reset', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase(); const user = await findUser(email)
  if (user) { const store = readJsonStore(); store.resetRequests.push({ email, requestedAt: new Date().toISOString() }); if (!mongoClient) writeJsonStore(store) }
  response.json({ message: 'If the account exists, reset instructions will be issued by the configured server mailer.' })
})
app.post('/api/auth/logout', authenticate, (request, response) => { sessions.delete(request.sessionToken); response.json({ ok: true }) })
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
app.get('/api/projects', authenticate, (_request, response) => { try { const projects = new Set(); Object.values(readWorkbook()).forEach(rows => rows.forEach(row => { if (row.Project) projects.add(String(row.Project)) })); response.json([...projects].sort()) } catch (error) { response.status(500).json({ error: error.message }) } })
app.get('/api/records', authenticate, (request, response) => { try { const data = readWorkbook(); const rows = data[String(request.query.module || '')] || data[`${request.query.module} Log`] || []; const project = String(request.query.project || 'All Projects'); response.json(project === 'All Projects' ? rows : rows.filter(row => String(row.Project || '') === project)) } catch (error) { response.status(500).json({ error: error.message }) } })
app.get('/api/standards', authenticate, (request, response) => { try { const query = String(request.query.query || '').toLowerCase(); response.json(readStandards().filter(row => !query || Object.values(row).some(value => String(value).toLowerCase().includes(query)))) } catch (error) { response.status(500).json({ error: error.message }) } })
app.get('/api/assets/:assetId', authenticate, (request, response) => { if (!process.env.CLOUDINARY_URL) return response.status(503).json({ error: 'Cloudinary is not configured on the API.' }); cloudinary.config({ secure: true }); response.json({ url: cloudinary.url(request.params.assetId, { secure: true, type: 'authenticated' }) }) })
app.get('/api/admin/users', requireAdmin, async (_request, response) => { const users = await collection('users'); if (!users) return response.json(readJsonStore().users.map(publicUser)); response.json(await users.find({}, { projection: { passwordHash: 0, salt: 0 } }).limit(500).toArray()) })
app.get('/api/admin/activity', requireAdmin, async (_request, response) => { const logs = await collection('activity_log'); response.json(logs ? await logs.find({}, { projection: { _id: 0 } }).sort({ occurred_at: -1 }).limit(500).toArray() : readJsonStore().activityLog || []) })
app.get('/api/admin/support-tickets', requireAdmin, async (_request, response) => { const tickets = await collection('support_tickets'); response.json(tickets ? await tickets.find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(500).toArray() : readJsonStore().supportTickets || []) })

ensureBootstrapAdmin()
  .then(() => app.listen(port, () => console.log(`Evomec QA/QC API listening on http://localhost:${port}`)))
  .catch(error => {
    console.error('Bootstrap admin initialization failed:', error instanceof Error ? error.message : error)
    app.listen(port, () => console.log(`Evomec QA/QC API listening on http://localhost:${port}`))
  })

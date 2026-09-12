import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import { MongoClient } from 'mongodb'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@blinkdotnew/sdk'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const port = Number(process.env.PORT || 8000)
const workbookPath = path.resolve(process.env.QAQC_EXCEL_PATH || path.join(__dirname, '../../QAQC_Dashboard/data/QAQC_Master.xlsx'))
const standardsPath = path.resolve(process.env.QAQC_STANDARDS_INDEX || path.join(__dirname, '../../QAQC_Dashboard/data/dep_standards_index.csv'))
const mongoClient = process.env.MONGODB_URI ? new MongoClient(process.env.MONGODB_URI) : null
const blinkServer = process.env.BLINK_SECRET_KEY ? createClient({ projectId: process.env.VITE_BLINK_PROJECT_ID || 'evomec-qaqc-centre-1hqjeqti', secretKey: process.env.BLINK_SECRET_KEY }) : null

app.use(express.json())
app.use((_request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || 'http://localhost:5173')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  next()
})

function readWorkbook() {
  const workbook = XLSX.readFile(workbookPath)
  return Object.fromEntries(workbook.SheetNames.map(sheet => [sheet, XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: null })]))
}

function readStandards() {
  const workbook = XLSX.read(fs.readFileSync(standardsPath, 'utf8'), { type: 'string', raw: false })
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
}

async function authenticate(request, response, next) {
  if (!blinkServer) return response.status(503).json({ error: 'Server authentication is not configured.' })
  const result = await blinkServer.auth.verifyToken(request.headers.authorization)
  if (!result.valid) return response.status(401).json({ error: 'Authentication required.' })
  request.user = result
  next()
}

async function requireAdmin(request, response, next) {
  await authenticate(request, response, () => {
    if (!request.user?.role || !['admin', 'super_admin'].includes(request.user.role)) {
      return response.status(403).json({ error: 'Administrator access required.' })
    }
    next()
  })
}

app.get('/health', (_request, response) => response.json({ ok: true, service: 'evomec-qaqc-api' }))

app.get('/api/projects', authenticate, (_request, response) => {
  try {
    const data = readWorkbook()
    const projects = new Set()
    Object.values(data).forEach(rows => rows.forEach(row => { if (row.Project) projects.add(String(row.Project)) }))
    response.json([...projects].sort())
  } catch (error) {
    response.status(500).json({ error: 'Workbook unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/records', authenticate, (request, response) => {
  try {
    const moduleName = String(request.query.module || '')
    const project = String(request.query.project || 'All Projects')
    const data = readWorkbook()
    const rows = data[moduleName] || data[`${moduleName} Log`] || []
    response.json(project === 'All Projects' ? rows : rows.filter(row => String(row.Project || '') === project))
  } catch (error) {
    response.status(500).json({ error: 'Workbook unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/standards', authenticate, (request, response) => {
  try {
    const query = String(request.query.query || '').toLowerCase()
    const rows = readStandards().filter(row => !query || Object.values(row).some(value => String(value).toLowerCase().includes(query)))
    response.json(rows)
  } catch (error) {
    response.status(500).json({ error: 'Standards index unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/assets/:assetId', authenticate, (request, response) => {
  if (!process.env.CLOUDINARY_URL) return response.status(503).json({ error: 'Cloudinary is not configured on the API.' })
  cloudinary.config({ secure: true })
  response.json({ url: cloudinary.url(request.params.assetId, { secure: true, type: 'authenticated' }) })
})

app.get('/api/admin/users', requireAdmin, async (_request, response) => {
  if (!mongoClient) return response.status(503).json({ error: 'MongoDB is not configured on the API.' })
  try {
    await mongoClient.connect()
    const database = mongoClient.db(process.env.MONGODB_DATABASE || 'qaqc_dashboard')
    response.json(await database.collection('users').find({}, { projection: { password: 0, passwordHash: 0 } }).limit(500).toArray())
  } catch (error) {
    response.status(500).json({ error: 'MongoDB unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.get('/api/admin/activity', requireAdmin, async (_request, response) => {
  if (!mongoClient) return response.status(503).json({ error: 'MongoDB is not configured on the API.' })
  try {
    await mongoClient.connect()
    const database = mongoClient.db(process.env.MONGODB_DATABASE || 'qaqc_dashboard')
    response.json(await database.collection('activity_logs').find({}).sort({ occurred_at: -1 }).limit(500).toArray())
  } catch (error) {
    response.status(500).json({ error: 'MongoDB unavailable', detail: error instanceof Error ? error.message : 'Unknown error' })
  }
})

app.listen(port, () => console.log(`Evomec QA/QC API listening on http://localhost:${port}`))

import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

export const MODULE_SHEETS = {
  'ITR Management': ['ITR Log'],
  'ITR Log': ['ITR Log'],
  'NCR Management': ['NCR Log'],
  'NCR Log': ['NCR Log'],
  Observations: ['OBS Log'],
  'OBS Log': ['OBS Log'],
  Concrete: ['Concrete Tracker'],
  'Concrete Tracker': ['Concrete Tracker'],
  Audits: ['Audit Register', 'Surveillance Register'],
  'Audit Register': ['Audit Register'],
  CTQ: ['CTQ Log'],
  'CTQ Log': ['CTQ Log'],
  Calibration: ['Calibration Log'],
  'Calibration Log': ['Calibration Log'],
  Documents: ['Document Register'],
  'Document Register': ['Document Register'],
  'Lessons Learned': ['Lessons Learned'],
  'Defect & Rework': ['Defect-Rework Log'],
  'QA/QC KPI': ['KPI KRA Register'],
  'Daily Reports': ['Daily Reports'],
  'Material Receipts': ['Material_Receipts'],
  'Project Register': ['Project Register'],
}

const DATE_COLUMNS = new Set([
  'date',
  'date raised',
  'due_date',
  'due date',
  'date_raised',
  'planned_date',
  'actual_date',
  'calibration_date',
  'next_due_date',
  'reminder_date',
  'issue_date',
  'start_date',
  'end_date',
  'target_date',
  'date_logged',
  'date identified',
  'date closed',
  'response date',
  'report_date',
  'acknowledged_on',
  'snoozed_until',
  'last_notified_on',
])

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function isDateColumn(name) {
  const key = String(name || '').trim().toLowerCase()
  return DATE_COLUMNS.has(key) || key.endsWith('_date') || key.endsWith(' date')
}

function excelSerialToIso(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial) || serial < 20000 || serial > 90000) return null
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400000)
  return new Date(utc).toISOString().slice(0, 10)
}

function formatValue(key, value) {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && isDateColumn(key)) return excelSerialToIso(value) ?? value
  if (typeof value === 'string') return value.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').trim()
  return value
}

function extraFields(sheetName) {
  if (sheetName === 'Audit Register') return { Record_Type: 'Audit' }
  if (sheetName === 'Surveillance Register') return { Record_Type: 'Surveillance' }
  return {}
}

function normalizeRow(row, sheetName) {
  const out = { ...extraFields(sheetName) }
  for (const [key, value] of Object.entries(row)) {
    const name = String(key || '').trim()
    if (!name || name.startsWith('__')) continue
    out[name] = formatValue(name, value)
  }
  // Apply after the cells so a workbook column named Source_Sheet cannot
  // replace the real worksheet used by protected date updates.
  if (!Object.prototype.hasOwnProperty.call(out, 'Source_Sheet')) out.Source_Sheet = sheetName
  out._Workbook_Sheet = sheetName
  if (Number.isInteger(row.__rowNum__)) out._Workbook_Row = row.__rowNum__
  return out
}

function projectOf(row) {
  return String(row.Project || row['Project/Area'] || '').trim()
}

function isOpenStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  if (!value) return false
  return ['open', 'pending', 'in progress', 'awaiting', 'planned', 'overdue', 'due soon'].some(token => value.includes(token))
}

function isClosedStatus(status) {
  const value = String(status || '').trim().toLowerCase()
  return ['closed', 'completed', 'accepted', 'valid', 'approved', 'passed', 'issued', 'responded', 'cancelled'].some(token => value === token || value.startsWith(token))
}

function monthKey(value) {
  const text = String(value || '')
  return /^\d{4}-\d{2}/.test(text) ? text.slice(0, 7) : null
}

function monthLabel(key) {
  const [year, month] = String(key).split('-')
  return `${MONTHS[Number(month) - 1] || key} ${year}`
}

export function createWorkbookStore(workbookPath) {
  let cache = { mtimeMs: -1, sheets: {}, sheetNames: [], updatedAt: null }

  function load() {
    if (!fs.existsSync(workbookPath)) {
      throw new Error(`QA/QC master workbook was not found at ${path.basename(workbookPath)}. Place QAQC_Master.xlsx in the data folder.`)
    }
    const stat = fs.statSync(workbookPath)
    if (cache.mtimeMs === stat.mtimeMs && cache.sheetNames.length) return cache
    const workbook = XLSX.readFile(workbookPath, { cellDates: true })
    const sheets = Object.fromEntries(workbook.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: null, raw: true })
      return [name, rows.map(row => normalizeRow(row, name))]
    }))
    cache = { mtimeMs: stat.mtimeMs, sheets, sheetNames: workbook.SheetNames, updatedAt: stat.mtime.toISOString() }
    return cache
  }

  function rowsForModule(module) {
    const data = load()
    const names = MODULE_SHEETS[module] || [module, `${module} Log`, `${module} Tracker`, `${module} Register`]
    return names.filter(name => data.sheets[name]).flatMap(name => data.sheets[name])
  }

  function filterProject(rows, project) {
    if (!project || project === 'All Projects') return rows
    return rows.filter(row => projectOf(row) === project)
  }

  function projects() {
    const set = new Set()
    for (const rows of Object.values(load().sheets)) {
      for (const row of rows) {
        const project = projectOf(row)
        if (project) set.add(project)
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }

  function moduleStats(module, project) {
    const rows = filterProject(rowsForModule(module), project)
    let overdue = 0
    let dueSoon = 0
    for (const row of rows) {
      const days = Number(row.Days_Until_Due)
      const status = String(row.Status || row.Alert_Status || '').toLowerCase()
      if (Number.isFinite(days)) {
        if (days < 0) overdue += 1
        else if (days <= 21) dueSoon += 1
      }
      if (status.includes('overdue')) overdue += 1
    }
    return {
      total: rows.length,
      open: rows.filter(row => isOpenStatus(row.Status || row.Alert_Status)).length,
      closed: rows.filter(row => isClosedStatus(row.Status || row.Alert_Status)).length,
      overdue,
      dueSoon,
      sheets: MODULE_SHEETS[module] || [module],
    }
  }

  function trend(module, project, dateKeys) {
    const rows = filterProject(rowsForModule(module), project)
    const buckets = new Map()
    for (const row of rows) {
      const dateValue = dateKeys.map(key => row[key]).find(Boolean)
      const key = monthKey(dateValue)
      if (!key) continue
      if (!buckets.has(key)) buckets.set(key, { key, month: monthLabel(key), raised: 0, closed: 0, open: 0 })
      const bucket = buckets.get(key)
      bucket.raised += 1
      if (isClosedStatus(row.Status)) bucket.closed += 1
      else bucket.open += 1
    }
    return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
  }

  function projectPerformance() {
    return projects().map(name => {
      const itr = moduleStats('ITR Management', name)
      const ncr = moduleStats('NCR Management', name)
      const audit = moduleStats('Audits', name)
      const docs = moduleStats('Documents', name)
      const itrPct = itr.total ? Math.round((itr.closed / itr.total) * 100) : null
      const auditPct = audit.total ? Math.round((audit.closed / audit.total) * 100) : null
      const docsPct = docs.total ? Math.round((docs.closed / docs.total) * 100) : null
      const scoreParts = [itrPct, auditPct, docsPct].filter(value => value != null)
      const average = scoreParts.length ? scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length : 0
      const score = average >= 95 ? 'A+' : average >= 90 ? 'A' : average >= 80 ? 'B+' : average >= 70 ? 'B' : average ? 'C' : '—'
      return {
        project: name,
        itrCompletion: itrPct == null ? '—' : `${itrPct}%`,
        ncrStatus: `${ncr.open} open`,
        audit: auditPct == null ? '—' : `${auditPct}%`,
        documentation: docsPct == null ? '—' : `${docsPct}%`,
        score,
      }
    })
  }

  function summary(project = 'All Projects') {
    const data = load()
    return {
      workbook: path.basename(workbookPath),
      updatedAt: data.updatedAt,
      sheets: data.sheetNames,
      datasets: data.sheetNames.map(name => ({ name, records: data.sheets[name]?.length || 0 })),
      project,
      projects: projects(),
      modules: {
        'ITR Management': moduleStats('ITR Management', project),
        'NCR Management': moduleStats('NCR Management', project),
        Observations: moduleStats('Observations', project),
        Concrete: moduleStats('Concrete', project),
        Audits: moduleStats('Audits', project),
        CTQ: moduleStats('CTQ', project),
        Calibration: moduleStats('Calibration', project),
      },
      itrTrend: trend('ITR Management', project, ['DATE', 'Date', 'Date Raised']),
      ncrTrend: trend('NCR Management', project, ['Date Raised', 'Date']),
      projectPerformance: project === 'All Projects' ? projectPerformance() : projectPerformance().filter(row => row.project === project),
    }
  }

  function info() {
    const exists = fs.existsSync(workbookPath)
    return {
      exists,
      workbook: path.basename(workbookPath),
      directory: path.basename(path.dirname(workbookPath)),
      sheets: exists ? load().sheetNames : [],
      updatedAt: exists ? load().updatedAt : null,
    }
  }

  function updateDate({ sheetName, rowNumber, field, value }) {
    if (!sheetName || !Number.isInteger(rowNumber) || rowNumber < 1) throw new Error('An exact workbook row is required.')
    if (!isDateColumn(field)) throw new Error('Only date fields can be updated from the Command Centre.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) throw new Error('Use a date in YYYY-MM-DD format.')

    // Use UTC so an administrator in a positive UTC offset does not have the
    // selected calendar day shifted backwards during validation or Excel write.
    const updatedDate = new Date(`${value}T00:00:00.000Z`)
    if (Number.isNaN(updatedDate.getTime()) || updatedDate.toISOString().slice(0, 10) !== value) throw new Error('The supplied date is invalid.')

    const source = XLSX.readFile(workbookPath, { cellDates: true })
    const sheet = source.Sheets[sheetName]
    if (!sheet || !sheet['!ref']) throw new Error(`Workbook sheet "${sheetName}" was not found.`)
    const range = XLSX.utils.decode_range(sheet['!ref'])
    let column = -1
    for (let index = range.s.c; index <= range.e.c; index += 1) {
      const header = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: index })]
      if (String(header?.v || '').trim() === String(field).trim()) { column = index; break }
    }
    if (column < 0) throw new Error(`Date field "${field}" was not found in ${sheetName}.`)
    if (rowNumber > range.e.r) throw new Error('The workbook row no longer exists. Refresh the records and try again.')

    const address = XLSX.utils.encode_cell({ r: rowNumber, c: column })
    const current = sheet[address] || {}
    sheet[address] = { ...current, t: 'd', v: updatedDate, z: current.z || 'yyyy-mm-dd' }
    XLSX.writeFile(source, workbookPath, { cellDates: true })
    cache.mtimeMs = -1

    return { sheetName, rowNumber, field: String(field).trim(), value }
  }

  return { load, rowsForModule, filterProject, projects, summary, info, updateDate, workbookPath }
}

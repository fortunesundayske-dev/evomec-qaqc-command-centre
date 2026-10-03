import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import XLSX from 'xlsx'
import { createWorkbookStore } from './workbook.mjs'

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qaqc-workbook-'))
  const file = path.join(directory, 'records.xlsx')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['KRA', 'KPI', 'Target', 'Frequency', 'Current Performance'],
    ['Audit', 'Audit Completion', '80%', 'Quarterly', ''],
  ]), 'KPI KRA Register')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Date', 'Project', 'Summary', 'Owner'],
  ]), 'Daily Reports')
  XLSX.writeFile(workbook, file)
  return { directory, file }
}

test('appends and updates complete records using existing worksheet fields', t => {
  const { directory, file } = fixture()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createWorkbookStore(file)

  const added = store.addRecord({
    module: 'KPI KRA Register',
    record: { KRA: 'CTQ', KPI: 'Inspection closeout', Target: 95, Frequency: 'Monthly' },
  })
  assert.equal(added.sheetName, 'KPI KRA Register')
  assert.ok(Number.isInteger(added.rowNumber))

  store.updateRecord({
    module: 'KPI KRA Register',
    sheetName: added.sheetName,
    rowNumber: added.rowNumber,
    record: { 'Current Performance': '91%' },
  })
  const rows = store.rowsForModule('KPI KRA Register')
  assert.equal(rows.length, 2)
  assert.equal(rows[1]._Workbook_Row, added.rowNumber)
  assert.equal(rows[1].KPI, 'Inspection closeout')
  assert.equal(rows[1].Target, 95)
  assert.equal(rows[1]['Current Performance'], '91%')
})

test('rejects unknown fields and module-to-sheet mismatches', t => {
  const { directory, file } = fixture()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createWorkbookStore(file)

  assert.throws(() => store.addRecord({ module: 'Daily Reports', record: { Formula: '=1+1' } }), /Unknown workbook field/)
  assert.throws(() => store.addRecord({ module: 'Daily Reports', record: { Date: {} } }), /must be text, a number, a boolean, or blank/)
  assert.throws(() => store.updateRecord({
    module: 'KPI KRA Register',
    sheetName: 'Daily Reports',
    rowNumber: 1,
    record: { Summary: 'Wrong module' },
  }), /not part of this module/)
})

test('rejects invalid date values and out-of-range workbook rows', t => {
  const { directory, file } = fixture()
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const store = createWorkbookStore(file)
  const added = store.addRecord({ module: 'Daily Reports', record: { Summary: 'Shift report' } })

  assert.throws(() => store.updateRecord({
    module: 'Daily Reports',
    sheetName: 'Daily Reports',
    rowNumber: added.rowNumber,
    record: { Date: '2026-02-30' },
  }), /valid YYYY-MM-DD date/)
  assert.throws(() => store.updateRecord({
    module: 'Daily Reports',
    sheetName: 'Daily Reports',
    rowNumber: 999,
    record: { Summary: 'Out of range' },
  }), /no longer exists/)
})

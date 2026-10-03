import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Save, SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { KpiRegisterDisplay } from '@/components/KpiRegisterDisplay'
import { localAuth } from '@/lib/local-auth'
import { qaqcApi, type QaqcRecord, type QaqcValue } from '@/lib/qaqc-api'

type Props = { module: string; project: string; search: string }

const hiddenColumns = new Set(['_Workbook_Sheet', '_Workbook_Row'])
const exactDateColumns = new Set([
  'date', 'date raised', 'due_date', 'due date', 'date_raised', 'planned_date', 'actual_date',
  'calibration_date', 'next_due_date', 'reminder_date', 'issue_date', 'start_date', 'end_date',
  'target_date', 'date_logged', 'date identified', 'date closed', 'response date', 'report_date',
  'acknowledged_on', 'snoozed_until', 'last_notified_on',
])

function valueText(value: QaqcValue | undefined) {
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function dateInputValue(value: QaqcValue | undefined) {
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match?.[1] ?? ''
}

function statusFor(row: QaqcRecord) {
  return valueText(row.Status ?? row.Alert_Status)
}

function disciplineFor(row: QaqcRecord) {
  return valueText(row.Discipline ?? row.Department ?? row.Trade)
}

function isDateField(field: string) {
  const normalized = field.trim().toLowerCase()
  return exactDateColumns.has(normalized) || normalized.endsWith('_date') || normalized.endsWith(' date')
}

export function InteractiveRecordsPage({ module, project, search }: Props) {
  const [records, setRecords] = useState<QaqcRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [status, setStatus] = useState('All statuses')
  const [discipline, setDiscipline] = useState('All disciplines')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState('')
  const [notice, setNotice] = useState('')
  const canEditDates = ['admin', 'super_admin'].includes(localAuth.getUser()?.role || '')
  const [recordFields, setRecordFields] = useState<string[]>([])
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null)
  const [editingRow, setEditingRow] = useState<QaqcRecord | null>(null)
  const [recordDraft, setRecordDraft] = useState<Record<string, string>>({})
  const [savingRecord, setSavingRecord] = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    void qaqcApi.records(module, project)
      .then(setRecords)
      .catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Unable to load QA/QC records.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [module, project])

  useEffect(() => {
    if (!canEditDates) return
    void qaqcApi.recordFields(module).then(setRecordFields).catch(loadError => setError(loadError instanceof Error ? loadError.message : 'Unable to load workbook fields.'))
  }, [canEditDates, module])

  const openRecordEditor = (mode: 'add' | 'edit', row?: QaqcRecord) => {
    setEditorMode(mode)
    setEditingRow(row || null)
    setRecordDraft(Object.fromEntries(recordFields.map(field => [field, row?.[field] == null ? '' : String(row[field])])) )
    setError('')
    setNotice('')
  }

  const saveRecord = async () => {
    const record = Object.fromEntries(Object.entries(recordDraft).map(([field, value]) => [field, value.trim() === '' ? null : value])) as QaqcRecord
    if (!Object.values(record).some(value => value !== null)) {
      setError('Enter at least one field before saving the record.')
      return
    }
    setSavingRecord(true)
    setError('')
    try {
      if (editorMode === 'add') {
        await qaqcApi.createRecord(module, record)
        setNotice('Record added to the controlled workbook.')
      } else if (editingRow) {
        const sheetName = String(editingRow._Workbook_Sheet || '')
        const rowNumber = Number(editingRow._Workbook_Row)
        await qaqcApi.updateRecord(module, sheetName, rowNumber, record)
        setNotice('Record updated in the controlled workbook.')
      }
      setEditorMode(null)
      setEditingRow(null)
      load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the workbook record.')
    } finally {
      setSavingRecord(false)
    }
  }

  const saveDate = async (row: QaqcRecord, field: string) => {
    const sheetName = String(row._Workbook_Sheet || '')
    const rowNumber = Number(row._Workbook_Row)
    const key = `${sheetName}:${rowNumber}:${field}`
    const value = drafts[key] ?? dateInputValue(row[field])
    if (!sheetName || !Number.isInteger(rowNumber)) {
      setError('This record does not have a writable workbook source row. Refresh the table and try again.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setError('Enter a valid date before saving it to the workbook.')
      return
    }
    setSaving(key)
    setError('')
    setNotice('')
    try {
      await qaqcApi.updateRecordDate(sheetName, rowNumber, field, value)
      setRecords(current => current.map(item => item.Source_Sheet === row.Source_Sheet && item._Workbook_Row === row._Workbook_Row ? { ...item, [field]: value } : item))
      setDrafts(current => { const next = { ...current }; delete next[key]; return next })
      setNotice(`${field.replace(/_/g, ' ')} was saved to ${sheetName}.`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the date to the workbook.')
    } finally {
      setSaving('')
    }
  }

  const headers = useMemo(() => {
    const found = new Set<string>()
    records.forEach(row => Object.keys(row).forEach(key => { if (!hiddenColumns.has(key)) found.add(key) }))
    return [...found]
  }, [records])
  const statuses = useMemo(() => ['All statuses', ...Array.from(new Set(records.map(statusFor).filter(value => value !== '—'))).sort()], [records])
  const disciplines = useMemo(() => ['All disciplines', ...Array.from(new Set(records.map(disciplineFor).filter(value => value !== '—'))).sort()], [records])
  const filteredRecords = useMemo(() => records.filter(row => {
    const recordText = Object.values(row).map(valueText).join(' ').toLowerCase()
    return (!search || recordText.includes(search.toLowerCase()))
      && (status === 'All statuses' || statusFor(row) === status)
      && (discipline === 'All disciplines' || disciplineFor(row) === discipline)
  }), [discipline, records, search, status])

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary">QUALITY OPERATIONS / {module.toUpperCase()}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{module}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Live records from the controlled QA/QC workbook for {project === 'All Projects' ? 'all projects' : project}.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canEditDates && <Button onClick={() => openRecordEditor('add')} className="gap-2 bg-primary text-primary-foreground"><Plus className="size-4" /> Add record</Button>}
        <Button variant="outline" onClick={() => setFiltersOpen(open => !open)} className="gap-2 border-border bg-card"><SlidersHorizontal className="size-4" /> Filters</Button>
        <Button onClick={load} disabled={loading} className="gap-2 bg-primary text-primary-foreground"><RefreshCw className="size-4" /> Refresh</Button>
      </div>
    </div>

    {filtersOpen && <Card className="border-primary/30 bg-card"><CardContent className="grid gap-4 p-4 sm:grid-cols-3">
      <label className="text-xs font-medium">Status<select value={status} onChange={event => setStatus(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm">{statuses.map(option => <option key={option}>{option}</option>)}</select></label>
      <label className="text-xs font-medium">Discipline<select value={discipline} onChange={event => setDiscipline(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm">{disciplines.map(option => <option key={option}>{option}</option>)}</select></label>
      <Button variant="ghost" onClick={() => { setStatus('All statuses'); setDiscipline('All disciplines') }}>Clear filters</Button>
    </CardContent></Card>}

    {notice && <div role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary">{notice}</div>}
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
    {module === 'KPI KRA Register' && !loading && !error && <KpiRegisterDisplay key={project} rows={filteredRecords} project={project} />}
    {editorMode && <Card className="border-primary/30 bg-card"><CardContent className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-primary">ADMINISTRATOR / WORKBOOK</p><h2 className="mt-1 text-lg font-semibold">{editorMode === 'add' ? 'Add record' : 'Edit record'}</h2></div><Button variant="ghost" size="icon" onClick={() => { setEditorMode(null); setEditingRow(null) }} aria-label="Close record editor"><X className="size-4" /></Button></div>
      {recordFields.length === 0 ? <p className="text-sm text-muted-foreground">No editable workbook fields were found for this module.</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{recordFields.map(field => {
        const sample = records.find(row => row[field] !== null && row[field] !== undefined)?.[field]
        const type = isDateField(field) ? 'date' : typeof sample === 'number' ? 'number' : 'text'
        const useTextarea = /description|comment|remark|summary|recommendation|action|observation|finding|details/i.test(field)
        return <label key={field} className="block min-w-0 text-xs font-medium">{field.replace(/_/g, ' ')}
          {useTextarea ? <textarea value={recordDraft[field] || ''} onChange={event => setRecordDraft(current => ({ ...current, [field]: event.target.value }))} rows={3} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" /> : <input type={type} step={type === 'number' ? 'any' : undefined} value={recordDraft[field] || ''} onChange={event => setRecordDraft(current => ({ ...current, [field]: event.target.value }))} className="mt-2 h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm" />}
        </label>
      })}</div>}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setEditorMode(null); setEditingRow(null) }}>Cancel</Button><Button disabled={savingRecord || recordFields.length === 0} onClick={() => { void saveRecord() }} className="gap-2 bg-primary text-primary-foreground"><Save className="size-4" />{savingRecord ? 'Saving…' : 'Save record'}</Button></div>
    </CardContent></Card>}
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground"><span>{loading ? 'Loading records…' : `Showing ${filteredRecords.length.toLocaleString()} of ${records.length.toLocaleString()} records`}</span><span>{canEditDates ? 'Administrator record editing enabled' : 'Workbook source · read only'}</span></div>
      {!loading && !error && filteredRecords.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No records match the selected project, search, and filters.</p>}
      {!loading && filteredRecords.length > 0 && <div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="sticky top-0 border-b border-border bg-muted/95 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><tr>{headers.map(header => <th key={header} className="whitespace-nowrap px-4 py-3">{header.replace(/_/g, ' ')}</th>)}{canEditDates && <th className="sticky right-0 bg-muted/95 px-4 py-3">Actions</th>}</tr></thead><tbody className="divide-y divide-border">{filteredRecords.map((row, rowIndex) => <tr key={`${valueText(row.ID ?? row.Reference ?? rowIndex)}-${rowIndex}`} className="transition hover:bg-muted/20">{headers.map(header => { const key = `${String(row._Workbook_Sheet || '')}:${String(row._Workbook_Row || '')}:${header}`; const editable = canEditDates && isDateField(header); return <td key={header} className="max-w-80 px-4 py-3.5 align-top">{editable ? <div className="flex min-w-52 items-center gap-2"><input type="date" value={drafts[key] ?? dateInputValue(row[header])} onChange={event => setDrafts(current => ({ ...current, [key]: event.target.value }))} className="h-8 min-w-0 rounded border border-border bg-background px-2 text-xs" /><Button size="sm" variant="outline" disabled={saving === key} onClick={() => { void saveDate(row, header) }}>{saving === key ? 'Saving…' : 'Save'}</Button></div> : header === 'Status' || header === 'Alert_Status' ? <span className="rounded-md bg-muted px-2 py-1 font-mono text-[10px]">{valueText(row[header])}</span> : valueText(row[header])}</td> })}{canEditDates && <td className="sticky right-0 whitespace-nowrap bg-card px-4 py-3 align-top"><Button size="sm" variant="outline" onClick={() => openRecordEditor('edit', row)}>Edit record</Button></td>}</tr>)}</tbody></table></div>}
    </div>
  </div>
}

import { useMemo, useState } from 'react'
import { SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Props = { module: string; project: string; search: string }

const sampleRows: Record<string, string[][]> = {
  'ITR Management': [['ITR-2026-00452', 'New IA Warehouse', 'Civil', 'Foundation excavation inspection', 'Open'], ['ITR-2026-00448', 'IA Access Road Expansion', 'Structural', 'Rebar installation', 'Awaiting Client']],
  'NCR Management': [['NCR-2026-0017', 'New IA Warehouse', 'Civil', 'Honeycombing at gridline C7', 'Open'], ['NCR-2026-0015', 'IA Infrastructure Phase 2', 'Mechanical', 'Incorrect pipe support spacing', 'Overdue']],
  Observations: [['OBS-2026-0084', 'NPT', 'Piping', 'Temporary support requires review', 'Open'], ['OBS-2026-0079', 'SS-41', 'Structural', 'Incomplete edge protection', 'Overdue']],
}

export function InteractiveRecordsPage({ module, project, search }: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [newRecordOpen, setNewRecordOpen] = useState(false)
  const [status, setStatus] = useState('All statuses')
  const [discipline, setDiscipline] = useState('All disciplines')
  const [description, setDescription] = useState('')
  const [notice, setNotice] = useState('')
  const rows = sampleRows[module] || [['REC-2026-001', project === 'All Projects' ? 'New IA Warehouse' : project, 'Quality', `${module} operational record`, 'Open']]
  const filteredRows = useMemo(() => rows.filter(row => (!project || project === 'All Projects' || row.includes(project)) && (!search || row.join(' ').toLowerCase().includes(search.toLowerCase())) && (status === 'All statuses' || row.includes(status)) && (discipline === 'All disciplines' || row.includes(discipline))), [discipline, project, rows, search, status])
  const disciplines = ['All disciplines', ...Array.from(new Set(rows.map(row => row[2])))]
  const statuses = ['All statuses', ...Array.from(new Set(rows.map(row => row[4])))]

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary">QUALITY OPERATIONS / {module.toUpperCase()}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{module}</h1><p className="mt-2 text-sm text-muted-foreground">Operational records for {project === 'All Projects' ? 'all active projects' : project}.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setFiltersOpen(value => !value)} className="gap-2 border-border bg-card"><SlidersHorizontal className="size-4" /> Filters</Button><Button onClick={() => setNewRecordOpen(true)} className="gap-2 bg-primary text-primary-foreground"><Sparkles className="size-4" /> New record</Button></div></div>
    {filtersOpen && <Card className="border-primary/30 bg-card"><CardContent className="grid gap-4 p-4 sm:grid-cols-3"><label className="text-xs font-medium">Status<select value={status} onChange={event => setStatus(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm">{statuses.map(option => <option key={option}>{option}</option>)}</select></label><label className="text-xs font-medium">Discipline<select value={discipline} onChange={event => setDiscipline(event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-3 text-sm">{disciplines.map(option => <option key={option}>{option}</option>)}</select></label><Button variant="ghost" onClick={() => { setStatus('All statuses'); setDiscipline('All disciplines') }}>Clear filters</Button></CardContent></Card>}
    {notice && <div role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{notice}</div>}
    <div className="overflow-hidden rounded-xl border border-border bg-card"><table className="w-full text-left text-xs"><thead className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase text-muted-foreground"><tr>{['Reference', 'Project', 'Discipline', 'Description', 'Status'].map(header => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-border">{filteredRows.map(row => <tr key={row[0]} className="transition hover:bg-muted/20">{row.map((cell, index) => <td key={`${row[0]}-${index}`} className="px-4 py-4">{cell}</td>)}</tr>)}</tbody></table>{!filteredRows.length && <p className="p-8 text-center text-sm text-muted-foreground">No records match the selected filters.</p>}</div>
    {newRecordOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><Card className="w-full max-w-lg border-primary/30 bg-card shadow-2xl"><CardHeader className="flex-row items-start justify-between"><div><CardTitle>New {module} record</CardTitle><p className="mt-1 text-sm text-muted-foreground">Capture a record for the controlled workflow.</p></div><Button variant="ghost" size="icon" onClick={() => setNewRecordOpen(false)} aria-label="Close"><X className="size-4" /></Button></CardHeader><CardContent><form onSubmit={event => { event.preventDefault(); setNotice(`New ${module} record staged successfully.`); setDescription(''); setNewRecordOpen(false) }} className="space-y-4"><label className="block text-sm font-medium">Description<input required value={description} onChange={event => setDescription(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3" placeholder="Describe the record" /></label><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setNewRecordOpen(false)}>Cancel</Button><Button type="submit" className="bg-primary text-primary-foreground">Stage record</Button></div></form></CardContent></Card></div>}
  </div>
}

import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Activity, AlertTriangle, BarChart3, BookOpen, Box, ChevronLeft,
  ClipboardCheck, ClipboardList, FileBarChart, FileText, Gauge, LayoutDashboard,
  LogOut, Menu, Search, ShieldCheck, Target, UserRound, Users, Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AuthGate } from '@/components/AuthGate'
import { InteractiveDatasetScene } from '@/components/InteractiveDatasetScene'
import { InteractiveRecordsPage } from '@/components/InteractiveRecordsPage'
import { localAuth } from '@/lib/local-auth'
import { qaqcApi, type LocalUser, type QaqcRecord, type QaqcSummary } from '@/lib/qaqc-api'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/app/')({
  head: () => ({ meta: [{ name: 'description', content: 'Evomec QA/QC Command Centre.' }] }),
  component: CommandCentre,
})

type ModuleKey =
  | 'Overview' | 'Daily Reports' | 'ITR Log' | 'NCR Log' | 'OBS Log' | 'Concrete Tracker'
  | 'Material_Receipts' | 'Audit Register' | 'Surveillance Register' | 'Document Register'
  | 'Lessons Learned' | 'Project Register' | 'Defect-Rework Log' | 'CTQ Log' | 'KPI KRA Register'
  | 'Calibration Log' | 'User Profile' | 'Activity Log' | 'Access / Administration'

const datasetGroups: Array<{ label: string; items: Array<{ label: Exclude<ModuleKey, 'Overview' | 'User Profile' | 'Activity Log' | 'Access / Administration'>; icon: typeof LayoutDashboard }> }> = [
  { label: 'Reports', items: [{ label: 'Daily Reports', icon: FileBarChart }, { label: 'Lessons Learned', icon: BookOpen }] },
  { label: 'Quality Records', items: [
    { label: 'ITR Log', icon: ClipboardList }, { label: 'NCR Log', icon: AlertTriangle },
    { label: 'OBS Log', icon: Activity }, { label: 'Defect-Rework Log', icon: Wrench },
  ] },
  { label: 'Engineering', items: [
    { label: 'Audit Register', icon: ShieldCheck }, { label: 'Surveillance Register', icon: Target },
    { label: 'Document Register', icon: FileText }, { label: 'Project Register', icon: LayoutDashboard },
    { label: 'CTQ Log', icon: Gauge }, { label: 'KPI KRA Register', icon: BarChart3 },
  ] },
  { label: 'Materials', items: [{ label: 'Concrete Tracker', icon: Box }, { label: 'Material_Receipts', icon: ClipboardCheck }] },
  { label: 'Audits', items: [{ label: 'Calibration Log', icon: Wrench }] },
]

const recordModules = new Set<ModuleKey>(datasetGroups.flatMap(group => group.items.map(item => item.label)))

function CommandCentre() {
  const [module, setModule] = useState<ModuleKey>('Overview')
  const [project, setProject] = useState('All Projects')
  const [projects, setProjects] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [mobileNav, setMobileNav] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const user = localAuth.getUser()

  useEffect(() => {
    let active = true
    void qaqcApi.projects().then(values => { if (active) setProjects(values) }).catch(() => { if (active) setProjects([]) })
    return () => { active = false }
  }, [])

  const chooseModule = (next: ModuleKey) => { setModule(next); setMobileNav(false) }
  const sidebar = <Sidebar module={module} chooseModule={chooseModule} collapsed={collapsed} user={user} />

  return <AuthGate><div className="min-h-dvh bg-background text-foreground">
    {mobileNav && <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setMobileNav(false)}><aside className="h-full w-72 overflow-y-auto border-r border-sidebar-border bg-sidebar p-3" onClick={event => event.stopPropagation()}>{sidebar}</aside></div>}
    <aside className={cn('fixed inset-y-0 left-0 z-30 hidden overflow-y-auto border-r border-sidebar-border bg-sidebar p-3 transition-all md:block', collapsed ? 'w-20' : 'w-72')}>{sidebar}</aside>
    <main className={cn('min-h-dvh transition-[padding] md:pl-72', collapsed && 'md:pl-20')}>
      <header className="sticky top-0 z-20 flex min-h-[76px] items-center justify-between gap-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-7">
        <div className="flex min-w-0 items-center gap-2"><Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu className="size-5" /></Button><Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setCollapsed(value => !value)} aria-label="Collapse navigation"><ChevronLeft className={cn('size-5 transition-transform', collapsed && 'rotate-180')} /></Button><div className="min-w-0"><p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary">EVOMEC / QUALITY SYSTEM</p><h1 className="truncate text-lg font-semibold">{module === 'Overview' ? 'QA/QC Command Centre' : module}</h1></div></div>
        <div className="flex items-center gap-2"><select aria-label="Current project" value={project} onChange={event => setProject(event.target.value)} className="h-9 max-w-52 rounded-md border border-border bg-card px-2 text-xs"><option>All Projects</option>{projects.map(name => <option key={name}>{name}</option>)}</select><span className="hidden font-mono text-[10px] uppercase tracking-wide text-muted-foreground sm:block">{user?.role || 'user'}</span></div>
      </header>
      <div className="mx-auto max-w-[1700px] p-4 sm:p-7">{recordModules.has(module) && <div className="mb-5 flex items-center gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} className="pl-9" placeholder="Search current records" /></div></div>}<PageContent module={module} project={project} search={search} user={user} onOpenDataset={name => { const item = datasetGroups.flatMap(group => group.items).find(dataset => dataset.label === name); if (item) chooseModule(item.label) }} /></div>
    </main>
  </div></AuthGate>
}

function Sidebar({ module, chooseModule, collapsed, user }: { module: ModuleKey; chooseModule: (module: ModuleKey) => void; collapsed: boolean; user: LocalUser | null }) {
  const navButton = (label: ModuleKey, Icon: typeof LayoutDashboard) => <button key={label} type="button" onClick={() => chooseModule(label)} title={collapsed ? label : undefined} className={cn('flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors', module === label ? 'bg-primary text-primary-foreground font-medium' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground')}><Icon className="size-4 shrink-0" />{!collapsed && <span className="truncate">{label}</span>}</button>
  return <div className="flex min-h-full flex-col"><div className="mb-5 flex items-center gap-3 px-2 pt-2"><div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary font-mono text-lg font-bold text-primary-foreground">E</div>{!collapsed && <div className="min-w-0"><p className="font-mono text-sm font-bold tracking-[0.18em]">EVOMEC</p><p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-primary">QA/QC Command Centre</p></div>}</div>
    {!collapsed && <div className="mb-4 rounded-lg border border-sidebar-border bg-card/60 px-3 py-2.5"><p className="truncate text-xs font-semibold">{user?.displayName || user?.email || 'User'}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{user?.role || 'user'}</p></div>}
    {!collapsed && <p className="mb-1 px-3 font-mono text-[9px] font-semibold tracking-[0.16em] text-muted-foreground">COMMAND CENTRE</p>}
    <nav className="space-y-4">{navButton('Overview', LayoutDashboard)}{datasetGroups.map(group => <div key={group.label}>{!collapsed && <p className="mb-1 px-3 font-mono text-[9px] font-semibold tracking-[0.16em] text-muted-foreground">{group.label}</p>}{group.items.map(item => navButton(item.label, item.icon))}</div>)}<div>{!collapsed && <p className="mb-1 px-3 font-mono text-[9px] font-semibold tracking-[0.16em] text-muted-foreground">Workspace</p>}{navButton('User Profile', UserRound)}</div>{user?.role === 'admin' || user?.role === 'super_admin' ? <div>{!collapsed && <p className="mb-1 px-3 font-mono text-[9px] font-semibold tracking-[0.16em] text-muted-foreground">Administration</p>}{navButton('Activity Log', Activity)}{navButton('Access / Administration', Users)}</div> : null}</nav>
    <div className="mt-auto border-t border-sidebar-border pt-3">{!collapsed && <p className="mb-1 px-3 font-mono text-[9px] font-semibold tracking-[0.16em] text-muted-foreground">SESSION</p>}<button type="button" onClick={() => { void localAuth.signOut() }} className="flex min-h-9 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"><LogOut className="size-4 shrink-0" />{!collapsed && <span>Sign out</span>}</button></div></div>
}

function PageContent({ module, project, search, user, onOpenDataset }: { module: ModuleKey; project: string; search: string; user: LocalUser | null; onOpenDataset: (name: string) => void }) {
  if (module === 'Overview') return <Overview project={project} onOpenDataset={onOpenDataset} />
  if (recordModules.has(module)) return <InteractiveRecordsPage module={module} project={project} search={search} />
  if (module === 'User Profile') return <ProfileEditor />
  if (module === 'Activity Log') return <ActivityLog user={user} />
  if (module === 'Access / Administration') return <AdminPanel user={user} />
  return <InteractiveRecordsPage module={module} project={project} search={search} />
}

function useSummary(project: string) {
  const [summary, setSummary] = useState<QaqcSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const refresh = () => { setLoading(true); setError(''); void qaqcApi.summary(project).then(setSummary).catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load the workbook summary.')).finally(() => setLoading(false)) }
  useEffect(refresh, [project])
  return { summary, error, loading, refresh }
}

function Overview({ project, onOpenDataset }: { project: string; onOpenDataset: (name: string) => void }) {
  const { summary, error, loading, refresh } = useSummary(project)
  const modules = summary?.modules || {}
  const cards = [
    ['ITRs', modules['ITR Management']], ['NCRs', modules['NCR Management']],
    ['Observations', modules.Observations], ['Audits', modules.Audits],
    ['Concrete pours', modules.Concrete], ['Calibration records', modules.Calibration],
  ] as const
  return <div className="space-y-6"><section className="relative overflow-hidden rounded-2xl border border-primary/25 p-6 shadow-sm sm:p-8" style={{ background: 'radial-gradient(circle at 90% 0%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 33rem), var(--card)' }}><div className="relative"><p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary">LIVE QUALITY INTELLIGENCE</p><h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Quality performance under control.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Current workbook data across inspections, non-conformances, audits, calibration, and controlled records for {project === 'All Projects' ? 'all projects' : project}.</p></div></section>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
    <section><SectionTitle eyebrow="EXECUTIVE SIGNALS" title="Quality pulse" action={loading ? 'Refreshing…' : 'WORKBOOK CONNECTED'} /><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">{cards.map(([label, stats]) => <MetricCard key={label} label={label} stats={stats} />)}</div></section>
    <section><SectionTitle eyebrow="WORKBOOK DATASETS" title="Available operational datasets" /><div className="mt-3"><InteractiveDatasetScene datasets={(summary?.datasets || []).map(dataset => ({ ...dataset, records: loading && !summary ? null : dataset.records }))} loading={loading} error={error} onOpenDataset={onOpenDataset} /></div></section>
  </div>
}

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: string }) { return <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="font-mono text-[10px] font-semibold tracking-[0.18em] text-primary">{eyebrow}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2></div>{action && <span className="font-mono text-[10px] text-muted-foreground">{action}</span>}</div> }
function MetricCard({ label, stats }: { label: string; stats: QaqcSummary['modules'][string] | undefined }) { return <Card className="min-h-[8.7rem] border-border bg-card/90"><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-3 font-mono text-3xl font-semibold">{stats?.total?.toLocaleString() || '0'}</p></CardContent></Card> }

function Reports({ project }: { project: string }) {
  const [message, setMessage] = useState('')
  const download = async (module: string) => {
    try {
      const rows = await qaqcApi.records(module, project)
      const columns = [...new Set(rows.flatMap(row => Object.keys(row)))]
      const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
      const csv = [columns.map(escape).join(','), ...rows.map(row => columns.map(column => escape(row[column])).join(','))].join('\n')
      const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = `${module.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-report.csv`; link.click(); URL.revokeObjectURL(link.href)
      setMessage(`${module} report downloaded (${rows.length.toLocaleString()} records).`)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to generate the report.') }
  }
  return <div className="space-y-6"><SectionTitle eyebrow="REPORTING CENTRE" title="Workbook reports" action={project} />{message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{['ITR Management', 'NCR Management', 'Observations', 'Audits', 'CTQ', 'Calibration', 'Documents'].map(name => <Card key={name} className="border-border bg-card"><CardContent className="p-5"><FileBarChart className="size-5 text-primary" /><h3 className="mt-4 font-semibold">{name} report</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">Download the current filtered workbook data as a CSV report.</p><Button onClick={() => { void download(name) }} className="mt-5 bg-primary text-primary-foreground">Download CSV</Button></CardContent></Card>)}</div></div>
}

function ProfilePanel() {
  const [profile, setProfile] = useState<LocalUser | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => { void qaqcApi.profile().then(setProfile).catch(reason => setMessage(reason instanceof Error ? reason.message : 'Unable to load profile.')) }, [])
  const upload = async () => { if (!photo) return; try { const result = await qaqcApi.uploadProfilePhoto(photo); setProfile(current => current ? { ...current, profilePhoto: result.profilePhoto, profilePhotoUrl: result.profilePhotoUrl } : current); setPhoto(null); setMessage('Profile photo saved securely.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Profile photo upload failed.') } }
  return <div className="space-y-6"><SectionTitle eyebrow="SYSTEM / USER PROFILE" title="User profile" action="Personal account" /><Card className="max-w-2xl border-border bg-card"><CardContent className="space-y-5 p-6">{profile?.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="Profile" className="size-24 rounded-2xl object-cover" /> : <div className="flex size-24 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">{(profile?.displayName || profile?.email || 'U').slice(0, 2).toUpperCase()}</div>}<div><p className="font-medium">{profile?.displayName || 'Loading account…'}</p><p className="mt-1 text-sm text-muted-foreground">{profile?.email} · {profile?.role || 'user'} · {profile?.status || 'approved'}</p></div><label className="block text-sm font-medium">Profile photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPhoto(event.target.files?.[0] || null)} className="mt-2 block text-sm" /></label><Button disabled={!photo} onClick={() => { void upload() }} className="bg-primary text-primary-foreground">Upload photo</Button>{message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}</CardContent></Card></div>
}

function ProfileEditor() {
  const [profile, setProfile] = useState<LocalUser | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void qaqcApi.profile()
      .then(user => {
        setProfile(user)
        setDisplayName(user.displayName || '')
        setDiscipline(user.discipline || '')
      })
      .catch(reason => setMessage(reason instanceof Error ? reason.message : 'Unable to load profile.'))
  }, [])

  const saveProfile = async () => {
    setSaving(true)
    setMessage('')
    try {
      const updated = await qaqcApi.updateProfile(displayName, discipline)
      setProfile(updated)
      localAuth.setUser(updated)
      setMessage('Profile details saved.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to save profile.')
    } finally {
      setSaving(false)
    }
  }
  const upload = async () => {
    if (!photo) return
    setSaving(true)
    setMessage('')
    try {
      const result = await qaqcApi.uploadProfilePhoto(photo)
      setProfile(current => current ? { ...current, profilePhoto: result.profilePhoto, profilePhotoUrl: result.profilePhotoUrl } : current)
      setPhoto(null)
      setMessage('Profile photo saved securely.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Profile photo upload failed.')
    } finally {
      setSaving(false)
    }
  }
  const selectPhoto = (file?: File) => {
    setMessage('')
    if (!file) { setPhoto(null); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhoto(null)
      setMessage('Choose a JPG, PNG, or WebP image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhoto(null)
      setMessage('Profile photos must be 5 MB or smaller.')
      return
    }
    setPhoto(file)
  }

  return <div className="space-y-6">
    <SectionTitle eyebrow="SYSTEM / USER PROFILE" title="User profile" action="Personal account" />
    <Card className="max-w-2xl border-border bg-card"><CardContent className="space-y-5 p-6">
      {profile?.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="Profile" className="size-24 rounded-2xl object-cover" /> : <div className="flex size-24 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">{(profile?.displayName || profile?.email || 'U').slice(0, 2).toUpperCase()}</div>}
      <div><p className="font-medium">{profile?.displayName || 'Loading account…'}</p><p className="mt-1 text-sm text-muted-foreground">{profile?.email} · {profile?.role || 'user'} · {profile?.status || 'approved'}</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium">Display name<Input value={displayName} onChange={event => setDisplayName(event.target.value)} className="mt-2" /></label>
        <label className="block text-sm font-medium">Discipline<Input value={discipline} onChange={event => setDiscipline(event.target.value)} className="mt-2" placeholder="Optional" /></label>
      </div>
      <Button disabled={saving || !displayName.trim()} onClick={() => { void saveProfile() }} className="bg-primary text-primary-foreground">Save profile</Button>
      <div className="border-t border-border pt-5"><p className="text-sm font-medium">Profile photo</p>{profile && <p role="status" className={profile.profilePhotoUploadEnabled ? 'mt-1 text-xs text-emerald-400' : 'mt-1 text-xs text-amber-400'}>{profile.profilePhotoUploadEnabled ? 'Cloudinary storage is ready.' : 'Cloudinary storage is not configured on the API server.'}</p>}<label className="mt-3 block text-xs text-muted-foreground">Choose JPG, PNG, or WebP (maximum 5 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => selectPhoto(event.target.files?.[0])} className="mt-2 block w-full text-sm" /></label>{photo && <p className="mt-2 truncate text-xs text-muted-foreground">Selected: {photo.name}</p>}<Button disabled={saving || !photo || !profile?.profilePhotoUploadEnabled} onClick={() => { void upload() }} className="mt-3 bg-primary text-primary-foreground">{saving ? 'Uploading…' : 'Upload to Cloudinary'}</Button></div>
      {message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}
    </CardContent></Card>
  </div>
}

function ActivityLog({ user }: { user: LocalUser | null }) { const [entries, setEntries] = useState<QaqcRecord[]>([]); const [message, setMessage] = useState(''); const isAdmin = ['admin', 'super_admin'].includes(user?.role || ''); useEffect(() => { if (isAdmin) void qaqcApi.activity().then(setEntries).catch(reason => setMessage(reason instanceof Error ? reason.message : 'Unable to load activity.')) }, [isAdmin]); if (!isAdmin) return <AccessDenied />; return <div className="space-y-6"><SectionTitle eyebrow="SYSTEM / ACTIVITY" title="Activity log" action="Administrators only" />{message && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p>}<div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-border bg-muted/50"><tr>{['Time', 'User', 'Action', 'Category', 'Status'].map(column => <th key={column} className="px-4 py-3">{column}</th>)}</tr></thead><tbody className="divide-y divide-border">{entries.map((entry, index) => <tr key={`${entry.event_id}-${index}`}><td className="px-4 py-3">{String(entry.occurred_at || '—')}</td><td className="px-4 py-3">{String(entry.email || entry.username || '—')}</td><td className="px-4 py-3">{String(entry.action || '—')}</td><td className="px-4 py-3">{String(entry.category || '—')}</td><td className="px-4 py-3">{String(entry.status || '—')}</td></tr>)}</tbody></table>{!entries.length && !message && <p className="p-8 text-center text-sm text-muted-foreground">No activity has been logged yet.</p>}</div></div> }

function AdminPanel({ user }: { user: LocalUser | null }) { const [users, setUsers] = useState<QaqcRecord[]>([]); const [message, setMessage] = useState(''); const isAdmin = ['admin', 'super_admin'].includes(user?.role || ''); useEffect(() => { if (isAdmin) void qaqcApi.adminUsers().then(setUsers).catch(reason => setMessage(reason instanceof Error ? reason.message : 'Unable to load users.')) }, [isAdmin]); if (!isAdmin) return <AccessDenied />; const save = async (account: QaqcRecord) => { const key = String(account.username || account.email || ''); try { await qaqcApi.updateAdminUser(key, { role: String(account.role || 'user'), status: String(account.status || 'pending') }); setMessage('Access updated.') } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update access.') } }; const change = (key: string, field: 'role' | 'status', value: string) => setUsers(current => current.map(account => String(account.username || account.email || '') === key ? { ...account, [field]: value } : account)); return <div className="space-y-6"><SectionTitle eyebrow="SYSTEM / ACCESS ADMIN" title="Access administration" action="Administrators only" />{message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}<div className="space-y-3">{users.map(account => { const key = String(account.username || account.email || ''); return <Card key={key} className="border-border bg-card"><CardContent className="grid gap-4 p-5 md:grid-cols-[1fr_160px_160px_100px] md:items-end"><div><p className="font-medium">{String(account.displayName || account.name || account.email || key)}</p><p className="text-xs text-muted-foreground">{String(account.email || '')}</p></div><label className="text-xs">Role<select value={String(account.role || 'user')} onChange={event => change(key, 'role', event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2"><option value="admin">admin</option><option value="user">user</option><option value="viewer">viewer</option></select></label><label className="text-xs">Status<select value={String(account.status || 'pending')} onChange={event => change(key, 'status', event.target.value)} className="mt-2 h-9 w-full rounded-md border border-border bg-background px-2"><option value="pending">pending</option><option value="approved">approved</option><option value="restricted">restricted</option><option value="rejected">rejected</option></select></label><Button onClick={() => { void save(account) }} className="bg-primary text-primary-foreground">Save</Button></CardContent></Card> })}{!users.length && !message && <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">No user accounts found.</p>}</div></div> }
function AccessDenied() { return <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6"><ShieldCheck className="size-6 text-destructive" /><h2 className="mt-3 font-semibold">Administrator access required</h2><p className="mt-1 text-sm text-muted-foreground">Your account does not have access to this protected area.</p></div> }

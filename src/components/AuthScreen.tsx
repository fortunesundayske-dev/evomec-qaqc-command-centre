import { FormEvent, useState } from 'react'
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { localAuth } from '@/lib/local-auth'

export type AuthMode = 'sign-in' | 'request-access' | 'reset'

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')

    try {
      if (mode === 'reset') {
        await localAuth.requestPasswordReset(email)
        setMessage('If an account exists for that address, reset instructions have been sent.')
      } else if (mode === 'request-access') {
        await localAuth.requestAccess(email, password, name)
        setMessage('Your access request was submitted for administrator review.')
        setMode('sign-in')
      } else {
        await localAuth.signIn(email, password)
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'The request could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  const isReset = mode === 'reset'
  const isRequest = mode === 'request-access'

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="pointer-events-none absolute inset-0 blueprint-grid opacity-30" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card/90 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.05fr_.95fr]">
        <section className="hidden border-r border-border p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="mb-14 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary font-mono text-lg font-bold text-primary-foreground">E</div>
              <div><p className="font-mono text-sm font-bold tracking-[0.18em]">EVOMEC</p><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">QA/QC Command Centre</p></div>
            </div>
            <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Secure QA/QC Access</span>
            <h1 className="mt-5 max-w-md text-4xl font-semibold tracking-tight sm:text-5xl">Quality records under control.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">A controlled workspace for inspections, non-conformances, audits, standards, and project quality intelligence.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {['Role-based access', 'Admin approval gate', 'Audit-ready records', 'Secure session control'].map(label => <div key={label} className="rounded-xl border border-border bg-background/40 p-3 text-xs text-muted-foreground"><ShieldCheck className="mb-2 size-4 text-primary" />{label}</div>)}
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <CardHeader className="px-0 pt-0"><div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="size-5" /></div><CardTitle className="text-2xl">{isReset ? 'Reset your password' : isRequest ? 'Request access' : 'Welcome back'}</CardTitle><p className="mt-2 text-sm text-muted-foreground">{isReset ? 'We will email a secure reset link if the account is registered.' : isRequest ? 'Requests are reviewed by an administrator before access is granted.' : 'Sign in to the Evomec QA/QC Command Centre.'}</p></CardHeader>
          <CardContent className="px-0 pb-0">
            <form onSubmit={submit} className="space-y-4">
              {isRequest && <label className="block text-sm font-medium">Full name<Input required value={name} onChange={event => setName(event.target.value)} className="mt-2" placeholder="Your name" /></label>}
              <label className="block text-sm font-medium">Work email<div className="relative mt-2"><Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input required type="email" value={email} onChange={event => setEmail(event.target.value)} className="pl-9" placeholder="name@company.com" /></div></label>
              {!isReset && <label className="block text-sm font-medium">Password<div className="relative mt-2"><KeyRound className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input required minLength={8} type="password" value={password} onChange={event => setPassword(event.target.value)} className="pl-9" placeholder="At least 8 characters" /></div></label>}
              {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
              {message && <p role="status" className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary">{message}</p>}
              <Button type="submit" disabled={busy} className="h-11 w-full bg-primary text-primary-foreground">{busy ? 'Please wait…' : isReset ? 'Email reset link' : isRequest ? 'Submit access request' : 'Sign in'}</Button>
            </form>
            <div className="mt-6 flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
              {!isReset && <button type="button" onClick={() => { setMode('reset'); setError(''); setMessage('') }} className="underline-offset-4 hover:text-foreground hover:underline">Forgot password?</button>}
              <button type="button" onClick={() => { setMode(isReset || isRequest ? 'sign-in' : 'request-access'); setError(''); setMessage('') }} className="font-medium text-primary hover:underline">{isReset || isRequest ? 'Back to sign in' : 'Request access'}</button>
            </div>
          </CardContent>
        </section>
      </div>
    </main>
  )
}

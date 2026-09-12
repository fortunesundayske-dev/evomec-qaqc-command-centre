import { useEffect, useState, type ReactNode } from 'react'
import { AuthScreen } from '@/components/AuthScreen'
import { ClientBoundary } from '@/components/ClientBoundary'
import { localAuth } from '@/lib/local-auth'

function ClientAuthGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let active = true
    const sync = () => {
      if (active) {
        setAuthenticated(Boolean(localAuth.getToken() && localAuth.getUser()))
        setLoading(false)
      }
    }
    sync()
    const unsubscribe = localAuth.subscribe(sync)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">Loading secure session…</div>
  }

  return authenticated ? <>{children}</> : <AuthScreen />
}

export function AuthGate({ children }: { children: ReactNode }) {
  return <ClientBoundary fallback={<div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">Loading secure session…</div>}><ClientAuthGate>{children}</ClientAuthGate></ClientBoundary>
}

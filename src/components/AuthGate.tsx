import { useEffect, useState, type ReactNode } from 'react'
import { blink } from '@/blink/client'
import { AuthScreen } from '@/components/AuthScreen'
import { BlinkClientBoundary } from '@/components/BlinkClientBoundary'

function ClientAuthGate({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    let active = true
    const sync = () => {
      if (active) {
        setAuthenticated(blink.auth.isAuthenticated())
        setLoading(false)
      }
    }
    sync()
    const unsubscribe = blink.auth.onAuthStateChanged(sync)
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
  return <BlinkClientBoundary fallback={<div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">Loading secure session…</div>}><ClientAuthGate>{children}</ClientAuthGate></BlinkClientBoundary>
}

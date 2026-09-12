import { ClientOnly } from '@tanstack/react-router'
import type { ReactNode } from 'react'

export function ClientBoundary({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <ClientOnly fallback={fallback}>{children}</ClientOnly>
}

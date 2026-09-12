import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import type { ReactNode } from 'react'
import indexCss from '../index.css?url'

const queryClient = new QueryClient()

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { title: 'Evomec QA/QC Command Centre' },
      { name: 'description', content: 'Secure enterprise quality assurance and quality control command centre.' },
      { name: 'theme-color', content: '#0a0a0a' },
    ],
    links: [{ rel: 'stylesheet', href: indexCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={0}><Toaster />{children}</TooltipProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}

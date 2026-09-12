import { createClient } from '@blinkdotnew/sdk'

export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'evomec-qaqc-centre-1hqjeqti',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY,
  authRequired: false,
  auth: { mode: 'managed' },
})

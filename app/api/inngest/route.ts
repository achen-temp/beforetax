import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { processDocumentJob } from '@/lib/inngest/functions/process-document'

// Extraction (sharp/heic-convert/mammoth + LLM calls) is Node-only and can run
// for minutes on a multi-page PDF. Inngest invokes the function through this
// route, so the long duration lives here (Vercel caps by plan: Hobby 60s, Pro 300s).
export const runtime = 'nodejs'
export const maxDuration = 300

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [processDocumentJob],
})

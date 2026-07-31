import {
  DOCUMENT_PROCESS_REQUESTED,
  inngest,
  type ProcessRequestedData,
} from '@/lib/inngest/client'
import { processDocument } from '@/lib/tax/process-document'
import { markExtractionFailed } from '@/lib/supabase/extraction'

/** Global cap on documents extracting at once (protects the LLM rate limit and
 * our own cost). Tune per OpenAI tier. */
const CONCURRENCY = parsePositiveInt(process.env.EXTRACTION_CONCURRENCY, 5)
/** Max extraction jobs STARTED per minute — a coarse rate cap layered on top of
 * the concurrency limit and the LLM client's own 429 backoff. */
const THROTTLE_PER_MIN = parsePositiveInt(process.env.EXTRACTION_THROTTLE_PER_MIN, 30)
/** Attempts before a job is parked as failed (Inngest retries with backoff).
 * Inngest accepts 0-20; env value is clamped. */
const RETRIES = Math.min(20, parsePositiveInt(process.env.EXTRACTION_RETRIES, 3))

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/** Transient failures worth retrying (provider busy / timeout / network). A
 * terminal failure (bad file, wrong form) is not retried — it stays failed. */
function isTransient(error: string | undefined): boolean {
  if (!error) return false
  return /timed out|timeout|429|rate limit|too many requests|50\d\b|temporarily|ECONNRESET|ETIMEDOUT|network|fetch failed/i.test(
    error
  )
}

/**
 * Background extraction worker. One document per event. Inngest queues events,
 * enforces the concurrency/throttle limits above, and retries the step with
 * exponential backoff when it throws. We only throw for TRANSIENT errors so the
 * platform retries those; terminal extraction failures are left marked failed.
 */
export const processDocumentJob = inngest.createFunction(
  {
    id: 'process-document',
    name: 'Process uploaded tax document',
    concurrency: { limit: CONCURRENCY },
    throttle: { limit: THROTTLE_PER_MIN, period: '1m' },
    retries: RETRIES as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10,
    triggers: [{ event: DOCUMENT_PROCESS_REQUESTED }],
  },
  async ({ event, step, attempt }) => {
    const { documentId, firmId, clientId } = event.data as ProcessRequestedData

    return step.run('extract', async () => {
      const result = await processDocument({ documentId, firmId, clientId })
      if (result.ok) return result

      // Retry transient provider issues; give up (stay failed) on terminal ones.
      if (isTransient(result.error) && attempt < RETRIES) {
        throw new Error(`transient extraction failure (attempt ${attempt + 1}): ${result.error}`)
      }
      // Final terminal outcome — make sure the document is marked failed so the
      // client sees a definitive state rather than a perpetual "processing".
      await markExtractionFailed(documentId, result.error ?? 'Processing failed').catch(() => {})
      return result
    })
  }
)

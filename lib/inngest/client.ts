import { Inngest } from 'inngest'

/** Payload for the document extraction job event. */
export interface ProcessRequestedData {
  documentId: string
  firmId: string
  clientId: string
}

export const DOCUMENT_PROCESS_REQUESTED = 'document/process.requested' as const

/**
 * Inngest client. In production it authenticates with INNGEST_EVENT_KEY /
 * INNGEST_SIGNING_KEY; in local dev the Inngest Dev Server discovers the app at
 * /api/inngest and needs no keys. Document extraction is offloaded here so the
 * upload request returns immediately and the platform handles queueing, global
 * concurrency limits, throttling (to respect the LLM's rate limits), and
 * automatic retries with backoff.
 */
export const inngest = new Inngest({ id: 'beforetax' })

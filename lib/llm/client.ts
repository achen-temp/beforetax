import { getLlmConfig, type LlmReasoningEffort } from '@/lib/llm/config'

/**
 * Client for the OpenAI Responses API (/v1/responses) with optional strict
 * json_schema structured outputs. Supports multimodal input (text, images, and
 * files/PDFs) so tax documents can be sent in their native format. No SDK
 * dependency — just fetch.
 *
 * Mirrors the request/response handling of a known-working integration:
 *   body   = { model, input:[{role,content:[...]}], text:{format:{...}} }
 *   output = response.output_text, or output[].content[].{text|json}
 */

export type InputTextPart = { type: 'input_text'; text: string }
export type ImageDetail = 'auto' | 'low' | 'high'
export type InputImagePart = { type: 'input_image'; image_url: string; detail?: ImageDetail }
/** A non-image document (e.g. PDF) sent inline as a data URL or by Files API id. */
export type InputFilePart = {
  type: 'input_file'
  filename?: string
  file_data?: string
  file_id?: string
}
export type InputPart = InputTextPart | InputImagePart | InputFilePart

export interface ResponsesMessage {
  role: 'system' | 'user' | 'assistant'
  content: InputPart[]
}

/** Strict JSON schema wrapper for structured outputs (text.format). */
export interface JsonSchemaFormat {
  name: string
  schema: Record<string, unknown>
  strict?: boolean
}

export interface ResponsesOptions {
  messages: ResponsesMessage[]
  model?: string
  maxOutputTokens?: number | null
  /** Overrides LLM_REASONING_EFFORT for this call (gpt-5 reasoning models). */
  reasoningEffort?: LlmReasoningEffort | null
  /** When provided, the provider enforces this schema on the output. */
  jsonSchema?: JsonSchemaFormat
}

export interface ResponsesResult {
  text: string
  model: string
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}

/** Thrown for transport/provider errors so callers can mark extraction failed. */
export class LlmError extends Error {
  status?: number
  /** True when a retry could plausibly succeed (429, 5xx, timeout, network). */
  retryable: boolean
  /** Provider-suggested wait before retrying, from a Retry-After header (ms). */
  retryAfterMs?: number
  constructor(message: string, status?: number, retryable = false) {
    super(message)
    this.name = 'LlmError'
    this.status = status
    this.retryable = retryable
  }
}

export function textPart(text: string): InputTextPart {
  return { type: 'input_text', text }
}

export function imagePartFromUrl(url: string, detail: ImageDetail = 'high'): InputImagePart {
  return { type: 'input_image', image_url: url, detail }
}

/** A base64/binary image as an inline data URL image part. Defaults to high
 * detail so dense tax documents are tiled at full resolution (not downsampled). */
export function imagePartFromBase64(
  base64: string,
  mimeType: string,
  detail: ImageDetail = 'high'
): InputImagePart {
  return { type: 'input_image', image_url: `data:${mimeType};base64,${base64}`, detail }
}

/** A base64/binary file (e.g. PDF) as an inline data URL file part. */
export function filePartFromBase64(base64: string, mimeType: string, filename: string): InputFilePart {
  return { type: 'input_file', filename, file_data: `data:${mimeType};base64,${base64}` }
}

/** A file already uploaded via the provider's Files API. */
export function filePartFromId(fileId: string): InputFilePart {
  return { type: 'input_file', file_id: fileId }
}

export async function runResponse(opts: ResponsesOptions): Promise<ResponsesResult> {
  const config = getLlmConfig()

  const body: Record<string, unknown> = {
    model: opts.model ?? config.model,
    input: opts.messages,
  }
  const maxOut = opts.maxOutputTokens ?? config.maxOutputTokens
  if (maxOut) body.max_output_tokens = maxOut
  const effort = opts.reasoningEffort ?? config.reasoningEffort
  if (effort) body.reasoning = { effort }
  if (opts.jsonSchema) {
    body.text = {
      format: {
        type: 'json_schema',
        name: opts.jsonSchema.name,
        strict: opts.jsonSchema.strict ?? true,
        schema: opts.jsonSchema.schema,
      },
    }
  }

  // Retry transient failures (provider busy / 5xx / timeout) with exponential
  // backoff + jitter, honoring Retry-After when the provider sends it. This
  // absorbs short "LLM too busy" spikes without failing the whole job; the
  // queue's concurrency limit is what prevents us from causing them.
  let lastError: LlmError = new LlmError('LLM request failed')
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await runResponseOnce(config, body, opts)
    } catch (e) {
      const err = e instanceof LlmError ? e : new LlmError(e instanceof Error ? e.message : 'LLM request failed')
      lastError = err
      if (!err.retryable || attempt === config.maxRetries) throw err
      await sleep(backoffMs(attempt, err.retryAfterMs))
    }
  }
  throw lastError
}

async function runResponseOnce(
  config: ReturnType<typeof getLlmConfig>,
  body: Record<string, unknown>,
  opts: ResponsesOptions
): Promise<ResponsesResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  let response: Response
  try {
    response = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
        ...config.extraHeaders,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      // Timeout: NOT retried here — each attempt already waited the full timeout,
      // and retrying would blow past the serverless function cap. The caller's
      // medium-effort fallback (and the queue's job retry) handle timeouts.
      throw new LlmError(`LLM request timed out after ${config.timeoutMs}ms`)
    }
    // Network/transport error: retryable.
    throw new LlmError(e instanceof Error ? e.message : 'LLM request failed', undefined, true)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const detail = await safeErrorBody(response)
    // 429 (rate limit) and 5xx (provider trouble) are worth retrying; other 4xx are not.
    const retryable = response.status === 429 || response.status >= 500
    const err = new LlmError(`LLM provider returned ${response.status}: ${detail}`, response.status, retryable)
    err.retryAfterMs = parseRetryAfter(response.headers.get('retry-after'))
    throw err
  }

  const json = (await response.json()) as ResponsesApiResponse

  if (json.error) {
    const msg = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
    throw new LlmError(`LLM provider error: ${msg}`)
  }

  const text = extractOutputText(json)
  if (!text) {
    throw new LlmError('LLM returned no text output')
  }

  return { text, model: json.model ?? (opts.model ?? config.model), usage: json.usage }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Exponential backoff (0.5s, 1s, 2s, 4s…) capped at 20s, with jitter. Honors an
 * explicit Retry-After hint from the provider when it is larger. */
function backoffMs(attempt: number, retryAfterMs?: number): number {
  const base = Math.min(20_000, 500 * 2 ** attempt)
  const jittered = base / 2 + Math.random() * (base / 2)
  return Math.max(jittered, retryAfterMs ?? 0)
}

/** Parse a Retry-After header (seconds, or an HTTP date) into milliseconds. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined
}

/**
 * Pull the assistant text out of a Responses payload. Prefers the aggregated
 * `output_text` convenience field, then falls back to scanning output items'
 * content parts for text / structured json (mirrors the reference integration).
 */
function extractOutputText(json: ResponsesApiResponse): string | null {
  if (typeof json.output_text === 'string' && json.output_text.trim() !== '') {
    return json.output_text
  }

  const output = json.output
  if (!Array.isArray(output)) return null

  for (const item of output) {
    const content = item?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part && typeof part.text === 'string' && part.text.trim() !== '') {
        return part.text
      }
      if (part && part.json !== undefined && part.json !== null) {
        return JSON.stringify(part.json)
      }
    }
  }
  return null
}

async function safeErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    return text.slice(0, 500)
  } catch {
    return response.statusText
  }
}

interface ResponsesApiResponse {
  model?: string
  output_text?: string
  error?: unknown
  output?: Array<{ content?: Array<{ type?: string; text?: string; json?: unknown }> }>
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}

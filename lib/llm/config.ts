/**
 * LLM configuration for the OpenAI Responses API (/v1/responses) with strict
 * json_schema structured outputs. Config is fully env-driven — swap key/model or
 * point at a compatible gateway without code changes:
 *
 *   LLM_API_BASE_URL       base URL incl. version, default https://api.openai.com/v1
 *   LLM_API_KEY            bearer token
 *   LLM_MODEL              model id, e.g. gpt-5-mini
 *   LLM_MAX_OUTPUT_TOKENS  optional cap on generated tokens (max_output_tokens)
 *   LLM_TIMEOUT_MS         optional request timeout, default 300000
 *   LLM_MAX_RETRIES        optional retry count for transient 429/5xx/timeout
 *                          responses (exponential backoff), default 3
 *   LLM_REASONING_EFFORT   optional default reasoning effort for gpt-5 models
 *                          (minimal | low | medium | high); callers may override
 *   LLM_VERIFY_EXTRACTION  set "true" to ALWAYS run the parallel verification pass
 *                          (default OFF). On = 2x tokens + cross-pass reconcile;
 *                          off = one stable single pass (still OCR-checked).
 *   LLM_SELECTIVE_VERIFY   when VERIFY_EXTRACTION is off, still run a SECOND pass
 *                          only for documents whose single pass looks uncertain
 *                          (OCR disagreement, low confidence, missing state, bad
 *                          Box 12 code, or a W-2 payroll ratio that doesn't
 *                          reconcile). Default ON. Set "false" for pure single-pass.
 *   LLM_OCR_CROSSCHECK     when "false", disables the Tesseract OCR cross-check
 *                          on numeric fields (default on). Best-effort; ignored
 *                          for non-image inputs.
 *   LLM_EXTRA_HEADERS      optional JSON object of extra headers
 *
 * Note: temperature is intentionally not sent — gpt-5 reasoning models reject a
 * non-default temperature, and extraction wants deterministic output anyway.
 */

export type LlmReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'

const REASONING_EFFORTS: readonly LlmReasoningEffort[] = ['minimal', 'low', 'medium', 'high']

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxOutputTokens: number | null
  timeoutMs: number
  maxRetries: number
  reasoningEffort: LlmReasoningEffort | null
  verifyExtraction: boolean
  selectiveVerify: boolean
  ocrCrossCheck: boolean
  extraHeaders: Record<string, string>
}

function parseReasoningEffort(value: string | undefined): LlmReasoningEffort | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  return (REASONING_EFFORTS as readonly string[]).includes(v) ? (v as LlmReasoningEffort) : null
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseNumber(value: string | undefined, fallback: number): number {
  return parseOptionalNumber(value) ?? fallback
}

function parseExtraHeaders(value: string | undefined): Record<string, string> {
  if (!value || value.trim() === '') return {}
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
  } catch {
    // fall through to warning
  }
  console.warn('LLM_EXTRA_HEADERS is not valid JSON; ignoring.')
  return {}
}

/**
 * Read + validate LLM config from env. Lazy (called at request time, not import)
 * so a missing key never breaks the build — only the extraction request fails,
 * with a clear message about which env var to set.
 */
export function getLlmConfig(): LlmConfig {
  const baseUrl = (process.env.LLM_API_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const apiKey = process.env.LLM_API_KEY ?? ''
  const model = process.env.LLM_MODEL ?? ''

  const missing: string[] = []
  if (!apiKey) missing.push('LLM_API_KEY')
  if (!model) missing.push('LLM_MODEL')
  if (missing.length > 0) {
    throw new Error(`LLM is not configured: set ${missing.join(', ')} in your environment.`)
  }

  return {
    baseUrl,
    apiKey,
    model,
    maxOutputTokens: parseOptionalNumber(process.env.LLM_MAX_OUTPUT_TOKENS),
    timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 300000),
    maxRetries: Math.max(0, parseNumber(process.env.LLM_MAX_RETRIES, 3)),
    reasoningEffort: parseReasoningEffort(process.env.LLM_REASONING_EFFORT),
    verifyExtraction: (process.env.LLM_VERIFY_EXTRACTION ?? 'false').toLowerCase() === 'true',
    selectiveVerify: (process.env.LLM_SELECTIVE_VERIFY ?? 'true').toLowerCase() !== 'false',
    ocrCrossCheck: (process.env.LLM_OCR_CROSSCHECK ?? 'true').toLowerCase() !== 'false',
    extraHeaders: parseExtraHeaders(process.env.LLM_EXTRA_HEADERS),
  }
}

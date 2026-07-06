/**
 * LLM configuration for the OpenAI Responses API (/v1/responses) with strict
 * json_schema structured outputs. Config is fully env-driven — swap key/model or
 * point at a compatible gateway without code changes:
 *
 *   LLM_API_BASE_URL       base URL incl. version, default https://api.openai.com/v1
 *   LLM_API_KEY            bearer token
 *   LLM_MODEL              model id, e.g. gpt-5-mini
 *   LLM_MAX_OUTPUT_TOKENS  optional cap on generated tokens (max_output_tokens)
 *   LLM_TIMEOUT_MS         optional request timeout, default 60000
 *   LLM_EXTRA_HEADERS      optional JSON object of extra headers
 *
 * Note: temperature is intentionally not sent — gpt-5 reasoning models reject a
 * non-default temperature, and extraction wants deterministic output anyway.
 */

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
  maxOutputTokens: number | null
  timeoutMs: number
  extraHeaders: Record<string, string>
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
    timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 60000),
    extraHeaders: parseExtraHeaders(process.env.LLM_EXTRA_HEADERS),
  }
}

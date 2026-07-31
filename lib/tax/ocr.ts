import 'server-only'
import { createWorker } from 'tesseract.js'

/**
 * Best-effort OCR cross-check. Tesseract is a classical (non-LLM) engine that
 * fails differently from the model, so it's a useful independent signal for
 * numeric boxes: two LLM passes can make the SAME digit misread and agree,
 * whereas OCR usually won't. Used only to influence review flags / break ties
 * between the two LLM passes — never as the source of truth on its own.
 *
 * Node-only (tesseract.js spawns workers). Any failure returns '' so the
 * surrounding extraction is never blocked by OCR.
 */

export interface OcrImage {
  base64: string
  mimeType: string
}

export async function ocrImages(images: OcrImage[]): Promise<string> {
  const targets = images.filter((i) => i.mimeType.startsWith('image/'))
  if (targets.length === 0) return ''

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null
  try {
    // Cache the downloaded language data under /tmp: on serverless hosts (Vercel)
    // the working directory is read-only, so the default cache write fails and
    // OCR silently no-ops. /tmp is the one writable path. The traineddata is
    // fetched from the CDN once per instance, then reused from this cache.
    worker = await createWorker('eng', undefined, { cachePath: '/tmp' })
    const parts: string[] = []
    for (const img of targets) {
      const buf = Buffer.from(img.base64, 'base64')
      const { data } = await worker.recognize(buf)
      parts.push(data.text ?? '')
    }
    return parts.join('\n')
  } catch (err) {
    console.warn('[ocr] cross-check skipped:', err instanceof Error ? err.message : err)
    return ''
  } finally {
    if (worker) await worker.terminate().catch(() => {})
  }
}

/**
 * Pull numeric tokens out of OCR text as JS numbers. OCR frequently confuses
 * thousands/decimal separators (e.g. reads "4,681.20" as "4.681.20"), so each
 * token is interpreted two ways and BOTH candidates are kept:
 *   A) US money: a trailing 2-digit group is treated as cents, the rest as the
 *      integer part regardless of which separator OCR used ("4.681.20" -> 4681.20)
 *   B) all digits concatenated as an integer (handles whole-dollar amounts)
 */
export function extractOcrNumbers(text: string): number[] {
  const out = new Set<number>()
  const tokens = text.match(/\d[\d.,]*\d|\d/g) ?? []
  for (const token of tokens) {
    for (const n of interpretNumberToken(token)) out.add(n)
  }
  return [...out]
}

function interpretNumberToken(token: string): number[] {
  const groups = token.split(/[.,]/).filter((g) => g.length > 0)
  if (groups.length === 0) return []
  const results: number[] = []

  if (groups.length >= 2 && groups[groups.length - 1].length === 2) {
    const cents = groups[groups.length - 1]
    const intPart = groups.slice(0, -1).join('')
    const v = Number(`${intPart}.${cents}`)
    if (Number.isFinite(v)) results.push(v)
  }

  const asInt = Number(groups.join(''))
  if (Number.isFinite(asInt)) results.push(asInt)
  return results
}

/** US state (+DC) postal codes, used to spot W-2 box-15 state rows in OCR text. */
const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID',
  'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
  'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA',
  'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
])

/**
 * Best-effort list of distinct state codes that appear on a plausible W-2 state
 * row in the OCR text. Used only as a COVERAGE signal (did the model miss a
 * state that is clearly on the page?) — never to add or invent state rows.
 *
 * Conservative on purpose: a two-letter state code is only counted when it sits
 * on a line that also contains a number (box 16/17 amounts) or the word "state".
 * This keeps common English words that happen to be state codes (IN, OR, ME…)
 * from firing on prose lines. It can still miss or over-report; callers must
 * treat the result as a hint (flag for review), not ground truth.
 */
export function extractStateCodes(text: string): string[] {
  const found = new Set<string>()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') continue
    const hasNumber = /\d/.test(line)
    const mentionsState = /state/i.test(line)
    if (!hasNumber && !mentionsState) continue
    for (const token of line.toUpperCase().match(/\b[A-Z]{2}\b/g) ?? []) {
      if (US_STATE_CODES.has(token)) found.add(token)
    }
  }
  return [...found]
}

import 'server-only'
import { z } from 'zod'
import {
  imagePartFromBase64,
  runResponse,
  textPart,
  type InputPart,
  type ResponsesMessage,
} from '@/lib/llm/client'
import { detectFormFamily, formFamily, ocrPages, type OcrImage } from '@/lib/tax/ocr'
import type { DocumentInput } from '@/lib/tax/extract-document'

/**
 * Multi-form segmentation. A single uploaded file can bundle several distinct tax
 * forms (two employers' W-2s, a W-2 + a 1099, etc.). This splits such a file into
 * one segment per form so each is classified and field-extracted on its own.
 *
 * Hybrid + conservative by design:
 *   1. An LLM assigns every page a lightweight fingerprint (form type, issuer id,
 *      primary amount, and whether it's a continuation of the previous page).
 *   2. Pages are grouped by that fingerprint — order-independent, so a form split
 *      across non-contiguous pages (page 1 + page 3, with a different form on
 *      page 2) still lands in one segment.
 *   3. Per-page OCR anchors independently cross-check the LLM's form family. Any
 *      disagreement marks the result uncertain; the caller then does NOT split and
 *      instead flags the document for a human — we never auto-split on a guess.
 */

interface PageFingerprint {
  page: number
  formType: string
  issuerId: string | null
  primaryAmount: number | null
  continuation: boolean
}

export interface DocumentSegment {
  /** Best form-type guess for the segment (may be 'unknown'; extraction confirms). */
  formType: string
  issuerId: string | null
  /** 1-based pages of the source file that make up this form. */
  pages: number[]
  /** OCR disagreed with the model on at least one of these pages. */
  uncertain: boolean
}

export interface SegmentationResult {
  segments: DocumentSegment[]
  /** More than one distinct form detected in the file. */
  multiForm: boolean
  /** Safe to auto-split: multi-form AND no segment is uncertain. */
  confident: boolean
  /** Segmentation didn't run (single page, non-image inputs, or a model error). */
  skipped: boolean
}

const pageFingerprintSchema = z.object({
  page: z.number().int(),
  form_type: z.string(),
  issuer_id: z.string().nullable(),
  primary_amount: z.number().nullable(),
  continuation: z.boolean(),
})

const segmentationSchema = z.object({ pages: z.array(pageFingerprintSchema) })

const SEGMENTATION_PROMPT = `You are splitting a scanned/photographed file that may contain SEVERAL different tax forms into individual forms. You are given the pages of ONE file, in order, each labeled "Page N".

For EVERY page, output an object with:
- "page": the page number (integer, matching the label).
- "form_type": the tax form on this page using the lowercase code (e.g. "w2", "1099_nec", "1099_int", "1099_div", "1099_g", "1099_sa", "1099_misc", "1099_k", "1099_r", "1099_b", "1098", "1098_t", "1095_a", "ssa_1099", "k1_1065"). Use "unknown" if the page is blank, an instructions/boilerplate page, or you cannot tell.
- "issuer_id": the issuer's identifying number as printed — a W-2 employer EIN, or a 1099 payer's TIN/EIN (digits only, keep any dashes). null if not visible.
- "primary_amount": the headline dollar amount that identifies this specific copy — W-2 Box 1 wages, or the main income box on a 1099. null if not visible.
- "continuation": true ONLY if this page is a continuation of the SAME form on the immediately preceding page (e.g. a second page of one long form), false otherwise.

Critical rules:
- Two W-2s from DIFFERENT employers are DIFFERENT forms (different issuer_id), even if both are W-2s.
- W-2 Copy B / Copy C / Copy 2 (Federal vs State vs City) for the SAME employer are ONE form — same issuer_id (EIN). Set continuation false but use the SAME issuer_id on every copy so they group together. Do NOT invent a different primary_amount to split them.
- The SAME form can span non-adjacent pages; identify each primarily by issuer_id, not by adjacency.
- Do NOT merge different forms. Do NOT invent values — use null when unsure.
- Return exactly one object per page, in page order.`

function imageInputs(inputs: DocumentInput[]): OcrImage[] {
  const out: OcrImage[] = []
  for (const input of inputs) {
    if ('base64' in input && input.mimeType.startsWith('image/')) {
      out.push({ base64: input.base64, mimeType: input.mimeType })
    }
  }
  return out
}

/** True only when every input is an image — the shape segmentation understands
 * (per-page rasterized images, page N == inputs[N-1]). */
export function isSegmentable(inputs: DocumentInput[]): boolean {
  return (
    inputs.length > 1 &&
    inputs.every((i) => 'base64' in i && i.mimeType.startsWith('image/'))
  )
}

function stripJsonFences(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

/** Digits-only EIN/TIN so "12-3456789" and "123456789" group as one issuer. */
function normalizeIssuerId(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}

/** Stable grouping key for a page's fingerprint. Falls back through issuer id ->
 * amount -> page so a weak fingerprint never silently merges two different forms. */
function groupKey(fp: PageFingerprint): string {
  const family = formFamily(fp.formType) ?? fp.formType.toLowerCase()
  const issuer = normalizeIssuerId(fp.issuerId)
  if (issuer) return `${family}|id:${issuer}`
  if (fp.primaryAmount != null) return `${family}|amt:${fp.primaryAmount}`
  return `${family}|p:${fp.page}`
}

/**
 * W-2 multi-copy guard: Federal / State / City copies of the SAME employer must
 * stay one segment. If Box 1 OCR drifts, amount-based keys can wrongly split them
 * — re-merge any W-2 segments that share a normalized EIN. When the whole file is
 * W-2 pages with exactly one EIN anywhere, fold orphan pages into that segment.
 */
function mergeW2CopiesByIssuer(
  segments: DocumentSegment[],
  fingerprints: PageFingerprint[]
): DocumentSegment[] {
  const w2Segs = segments.filter((s) => formFamily(s.formType) === 'w2')
  if (w2Segs.length <= 1) return segments

  const byIssuer = new Map<string, DocumentSegment[]>()
  const orphans: DocumentSegment[] = []
  for (const seg of w2Segs) {
    const issuer = normalizeIssuerId(seg.issuerId)
    if (!issuer) {
      orphans.push(seg)
      continue
    }
    const list = byIssuer.get(issuer) ?? []
    list.push(seg)
    byIssuer.set(issuer, list)
  }

  const mergedW2: DocumentSegment[] = []
  for (const [issuer, list] of byIssuer) {
    if (list.length === 1) {
      mergedW2.push(list[0])
      continue
    }
    const pages = [...new Set(list.flatMap((s) => s.pages))].sort((a, b) => a - b)
    const uncertain = list.some((s) => s.uncertain)
    mergedW2.push({
      formType: list[0].formType,
      issuerId: issuer,
      pages,
      uncertain,
    })
  }

  // Single-employer W-2 packet: orphan pages (missing EIN on that page) belong
  // with the only known EIN — classic multi-copy scan where one page is blurry.
  const issuers = [...byIssuer.keys()]
  if (issuers.length === 1 && orphans.length > 0) {
    const only = mergedW2[0]
    only.pages = [...new Set([...only.pages, ...orphans.flatMap((o) => o.pages)])].sort(
      (a, b) => a - b
    )
    only.uncertain = only.uncertain || orphans.some((o) => o.uncertain)
  } else {
    mergedW2.push(...orphans)
  }

  // Also: if every fingerprint in the file is W-2 and exactly one EIN appears
  // anywhere, force a single segment (even when amount-keys split them first).
  const allW2 =
    fingerprints.length > 0 &&
    fingerprints.every((fp) => {
      const fam = formFamily(fp.formType)
      return fam === 'w2' || fp.formType.toLowerCase() === 'unknown'
    })
  const fileIssuers = new Set(
    fingerprints.map((fp) => normalizeIssuerId(fp.issuerId)).filter((id): id is string => !!id)
  )
  if (allW2 && fileIssuers.size === 1 && mergedW2.length > 1) {
    const issuer = [...fileIssuers][0]
    const pages = [...new Set(mergedW2.flatMap((s) => s.pages))].sort((a, b) => a - b)
    return [
      {
        formType: 'w2',
        issuerId: issuer,
        pages,
        uncertain: mergedW2.some((s) => s.uncertain),
      },
    ]
  }

  const nonW2 = segments.filter((s) => formFamily(s.formType) !== 'w2')
  return [...mergedW2, ...nonW2]
}

/** Group per-page fingerprints into form segments. Continuation/unknown pages
 * attach to the current segment; identified pages group by fingerprint. */
function groupPages(fingerprints: PageFingerprint[]): DocumentSegment[] {
  const ordered = [...fingerprints].sort((a, b) => a.page - b.page)
  const segments: DocumentSegment[] = []
  const keyToIndex = new Map<string, number>()
  let lastIndex: number | null = null

  for (const fp of ordered) {
    const isUnknown = fp.formType.toLowerCase() === 'unknown' || formFamily(fp.formType) === null
    if (fp.continuation || isUnknown) {
      if (lastIndex !== null) {
        segments[lastIndex].pages.push(fp.page)
        continue
      }
      // Leading unknown page with nothing to attach to — its own weak segment.
      segments.push({ formType: 'unknown', issuerId: null, pages: [fp.page], uncertain: true })
      lastIndex = segments.length - 1
      continue
    }

    const key = groupKey(fp)
    const existing = keyToIndex.get(key)
    if (existing !== undefined) {
      segments[existing].pages.push(fp.page)
      lastIndex = existing
      continue
    }
    segments.push({ formType: fp.formType, issuerId: fp.issuerId, pages: [fp.page], uncertain: false })
    const index = segments.length - 1
    keyToIndex.set(key, index)
    lastIndex = index
  }

  for (const seg of segments) seg.pages.sort((a, b) => a - b)
  return segments
}

/** Cross-check each fingerprint's form family against a per-page OCR anchor. Marks
 * a page's segment uncertain when both signals exist and disagree. */
function applyOcrCrossCheck(
  segments: DocumentSegment[],
  fingerprints: PageFingerprint[],
  ocrText: string[]
): void {
  if (ocrText.length === 0) return
  const pageToSegment = new Map<number, DocumentSegment>()
  for (const seg of segments) for (const p of seg.pages) pageToSegment.set(p, seg)

  for (const fp of fingerprints) {
    const seg = pageToSegment.get(fp.page)
    if (!seg) continue
    const aiFamily = formFamily(fp.formType)
    const ocr = ocrText[fp.page - 1]
    if (aiFamily === null || ocr === undefined) continue
    const ocrFamily = detectFormFamily(ocr)
    if (ocrFamily !== null && ocrFamily !== aiFamily) seg.uncertain = true
  }
}

const skipped: SegmentationResult = { segments: [], multiForm: false, confident: false, skipped: true }

export async function segmentDocument(params: {
  inputs: DocumentInput[]
  model?: string
}): Promise<SegmentationResult> {
  if (!isSegmentable(params.inputs)) return skipped

  const images = imageInputs(params.inputs)

  // Fingerprint every page with the model. OCR runs alongside for the cross-check.
  const content: InputPart[] = [textPart(SEGMENTATION_PROMPT)]
  images.forEach((img, i) => {
    content.push(textPart(`Page ${i + 1}:`))
    content.push(imagePartFromBase64(img.base64, img.mimeType))
  })
  const messages: ResponsesMessage[] = [{ role: 'user', content }]

  let fingerprints: PageFingerprint[]
  let ocrText: string[] = []
  try {
    const [result, ocr] = await Promise.all([
      runResponse({
        messages,
        model: params.model,
        // Boundary detection is a lighter task than field extraction; medium keeps
        // it accurate without doubling latency.
        reasoningEffort: 'medium',
        jsonSchema: {
          name: 'page_segmentation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              pages: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    page: { type: 'integer' },
                    form_type: { type: 'string' },
                    issuer_id: { type: ['string', 'null'] },
                    primary_amount: { type: ['number', 'null'] },
                    continuation: { type: 'boolean' },
                  },
                  required: ['page', 'form_type', 'issuer_id', 'primary_amount', 'continuation'],
                },
              },
            },
            required: ['pages'],
          },
        },
      }),
      ocrPages(images).catch(() => [] as string[]),
    ])
    ocrText = ocr
    const parsed = segmentationSchema.safeParse(JSON.parse(stripJsonFences(result.text)))
    if (!parsed.success || parsed.data.pages.length === 0) return skipped
    fingerprints = parsed.data.pages.map((p) => ({
      page: p.page,
      formType: p.form_type,
      issuerId: p.issuer_id,
      primaryAmount: p.primary_amount,
      continuation: p.continuation,
    }))
  } catch (err) {
    console.warn('[segment] skipped:', err instanceof Error ? err.message : err)
    return skipped
  }

  let segments = groupPages(fingerprints)
  segments = mergeW2CopiesByIssuer(segments, fingerprints)
  applyOcrCrossCheck(segments, fingerprints, ocrText)

  const multiForm = segments.length > 1
  const confident = multiForm && segments.every((s) => !s.uncertain)
  return { segments, multiForm, confident, skipped: false }
}

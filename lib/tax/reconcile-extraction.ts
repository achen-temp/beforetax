import type { DocumentType } from '@/lib/tax/document-types'
import type { DocumentFieldInput } from '@/lib/tax/flatten-extraction'
import type { FormSchema } from '@/lib/tax/field-schemas'
import { isValid1099RDistributionCode } from '@/lib/tax/1099-r-codes'

/**
 * Cross-checks two independent extraction passes over the same document and
 * rewrites each field's confidence based on whether the passes AGREE:
 *   - agree      -> trusted (won't be flagged for review)
 *   - disagree   -> conflict (flagged)
 *   - only in A  -> unverified single read (flagged)
 *
 * Agreement between two independent reads is a stronger accuracy signal than the
 * model's self-reported confidence, so it overrides it. Caveat: the same model
 * can make the SAME misread twice, so agreement is strong evidence, not proof.
 *
 * For NUMERIC fields we add a third, independent signal: OCR (Tesseract) numbers
 * read off the same page. OCR fails differently from the LLM, so it can catch a
 * shared LLM misread and break ties between the two passes.
 *
 * HOW ROWS ARE MATCHED across passes (this matters for correctness):
 *   - scalar fields         -> by field_key (always line_index 0)
 *   - repeating {code,value}-> by field_key + CODE (box 12/14), so 12b lines up
 *     with 12b regardless of order, and a code only one pass caught is recovered
 *   - group sub-fields      -> by field_key + POSITION (line_index). Two passes
 *     may order group entries (e.g. states) differently, so positional matches
 *     are treated as UNCERTAIN: we never adopt the other pass's value here (doing
 *     so caused NJ/PA amounts to swap), only confirm/flag.
 */

/** Both LLM passes agree (non-numeric, or numeric with no OCR available). */
export const AGREE_CONFIDENCE = 0.97
/** Both LLM passes agree AND OCR confirms the number. */
export const TRIPLE_CONFIDENCE = 0.99
/** OCR broke a tie between the two LLM passes (scalar fields only). */
export const OCR_RESOLVED_CONFIDENCE = 0.95
/** Passes disagree (OCR couldn't resolve), or agree but OCR can't confirm. */
export const CONFLICT_CONFIDENCE = 0.4
/** Only one pass produced the row. */
export const SINGLE_READ_CONFIDENCE = 0.6
/** Single-pass: numeric value the OCR pass could not confirm -> flag for review. */
export const OCR_UNCONFIRMED_CONFIDENCE = 0.6
/** State section flagged because OCR saw a state the model didn't return, or a
 * duplicated state resolved with conflicting values. */
export const STATE_COVERAGE_CONFIDENCE = 0.55
/** A W-2 payroll ratio (SS/Medicare) doesn't reconcile — likely a digit misread. */
export const ARITHMETIC_CONFLICT_CONFIDENCE = 0.45
/** A W-2 Box 12 code is not a recognized IRS code — likely a misread. */
export const BOX12_CODE_CONFIDENCE = 0.5
/** A Phase-1 form business rule failed (e.g. SSA net ≠ paid − repaid). */
export const FORM_RULE_CONFLICT_CONFIDENCE = 0.45
/** 1099-R Box 7 code not in the IRS distribution-code set. */
export const DIST_CODE_CONFIDENCE = 0.5

const FICA_SS_RATE = 0.062
const MEDICARE_RATE = 0.0145
/** 0.9% Additional Medicare tax applies above the wage threshold, so box 6 can
 * legitimately run up to 2.35% of box 5. */
const ADDL_MEDICARE_RATE = 0.009

/** Valid IRS W-2 Box 12 codes (letters, case-insensitive). */
const BOX12_CODES = new Set([
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R',
  'S', 'T', 'V', 'W', 'Y', 'Z', 'AA', 'BB', 'DD', 'EE', 'FF', 'GG', 'HH', 'II',
])

interface KeySets {
  /** Field keys of top-level repeating {code,value} fields (matched by code). */
  repeatingKeys: Set<string>
  /** Field keys that are sub-fields of a group (matched by position). */
  groupSubKeys: Set<string>
}

/** Derive which field keys are repeating-by-code vs. positional group sub-fields. */
export function deriveKeySets(schema: FormSchema): KeySets {
  const repeatingKeys = new Set<string>()
  const groupSubKeys = new Set<string>()
  for (const field of schema.fields) {
    if (field.type === 'group' && field.fields) {
      for (const sub of field.fields) groupSubKeys.add(sub.key)
    } else if (field.repeating || field.slots) {
      // Slotted fields (box 12/14) flatten to the same code/value rows as
      // repeating fields, so they match across passes by field_key + code.
      repeatingKeys.add(field.key)
    }
  }
  return { repeatingKeys, groupSubKeys }
}

function matchKey(r: DocumentFieldInput, keys: KeySets): string {
  if (keys.repeatingKeys.has(r.field_key)) {
    return `${r.field_key}#code#${(r.code ?? '').trim().toLowerCase()}`
  }
  if (keys.groupSubKeys.has(r.field_key)) {
    return `${r.field_key}#pos#${r.line_index}`
  }
  return `${r.field_key}#scalar`
}

function fallbackKeyForRepeating(r: DocumentFieldInput): string {
  const value =
    r.value_number !== null ? String(r.value_number) : (r.value_date ?? r.value_text ?? '').trim().toLowerCase()
  return `${r.field_key}#val#${value}`
}

function sameValue(a: DocumentFieldInput, b: DocumentFieldInput): boolean {
  if (a.value_number !== null || b.value_number !== null) {
    return a.value_number === b.value_number
  }
  if (a.value_date !== null || b.value_date !== null) {
    return a.value_date === b.value_date
  }
  const at = (a.value_text ?? '').trim().toLowerCase()
  const bt = (b.value_text ?? '').trim().toLowerCase()
  return at === bt
}

/** Does any OCR number match x? Exact-to-the-cent, or (for money-sized values)
 * an integer match to tolerate OCR dropping the cents. */
function ocrHas(numbers: number[], x: number | null): boolean {
  if (x === null) return false
  return numbers.some((n) => Math.abs(n - x) < 0.005 || (Math.abs(x) >= 100 && n === Math.trunc(x)))
}

export interface ReconcileResult {
  rows: DocumentFieldInput[]
  agreed: number
  conflicts: number
  singleRead: number
  ocrResolved: number
  recovered: number
}

/**
 * Single-pass safety net (default path). Deterministic: it NEVER changes values,
 * reorders, drops, or adds rows — it only lowers confidence on numeric fields
 * whose value the OCR pass could not find on the page (a likely misread, e.g. a
 * transposed digit). Same image -> same result, so the UI never jitters.
 */
export function applyOcrConfidence(
  rows: DocumentFieldInput[],
  ocrNumbers?: number[]
): DocumentFieldInput[] {
  if (!Array.isArray(ocrNumbers) || ocrNumbers.length === 0) return rows
  return rows.map((r) => {
    if (r.data_type !== 'number' || r.value_number === null) return r
    if (ocrHas(ocrNumbers, r.value_number)) return r
    return {
      ...r,
      confidence: Math.min(r.confidence ?? OCR_UNCONFIRMED_CONFIDENCE, OCR_UNCONFIRMED_CONFIDENCE),
    }
  })
}

/** A top-level scalar row for a field (line_index 0), if present. */
function findScalar(rows: DocumentFieldInput[], key: string): DocumentFieldInput | undefined {
  return rows.find((r) => r.field_key === key && r.line_index === 0)
}

/**
 * W-2 payroll math self-check (deterministic, W-2 only). Two fixed relationships
 * hold on any correct W-2, so a violation is strong evidence of a digit misread
 * in one of the boxes involved — we lower confidence on that pair to flag it for
 * review. It NEVER changes a value.
 *
 *   box 4 (SS tax)       ≈ (box 3 SS wages + box 7 SS tips) × 6.2%
 *   box 6 (Medicare tax) ∈ [box 5 × 1.45%, box 5 × 2.35%]   (upper bound includes
 *                          the 0.9% Additional Medicare over the wage threshold)
 *
 * Skipped when the anchor boxes are missing or zero. The tolerance absorbs
 * per-paycheck rounding; a transposed digit blows well past it.
 */
export function applyW2ArithmeticChecks(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  const flag = new Set<string>()

  const ssWages = findScalar(rows, 'social_security_wages')?.value_number ?? null
  const ssTips = findScalar(rows, 'social_security_tips')?.value_number ?? 0
  const ssTax = findScalar(rows, 'social_security_tax_withheld')?.value_number ?? null
  if (ssWages !== null && ssWages > 0 && ssTax !== null) {
    const expected = (ssWages + (ssTips ?? 0)) * FICA_SS_RATE
    const tol = Math.max(1, expected * 0.01)
    if (Math.abs(ssTax - expected) > tol) {
      flag.add('social_security_wages')
      flag.add('social_security_tax_withheld')
    }
  }

  const medWages = findScalar(rows, 'medicare_wages')?.value_number ?? null
  const medTax = findScalar(rows, 'medicare_tax_withheld')?.value_number ?? null
  if (medWages !== null && medWages > 0 && medTax !== null) {
    const low = medWages * MEDICARE_RATE
    const high = medWages * (MEDICARE_RATE + ADDL_MEDICARE_RATE)
    const tol = Math.max(1, low * 0.01)
    if (medTax < low - tol || medTax > high + tol) {
      flag.add('medicare_wages')
      flag.add('medicare_tax_withheld')
    }
  }

  if (flag.size === 0) return rows
  return rows.map((r) =>
    flag.has(r.field_key) && r.line_index === 0
      ? {
          ...r,
          confidence: Math.min(r.confidence ?? ARITHMETIC_CONFLICT_CONFIDENCE, ARITHMETIC_CONFLICT_CONFIDENCE),
        }
      : r
  )
}

/**
 * Validate/normalize W-2 Box 12 codes against the fixed IRS code set. Upper-cases
 * the code (a safe normalization) and flags any row whose code is not a recognized
 * Box 12 code for review — a likely OCR/model misread. It never invents a code or
 * touches the amount. (Box 14 codes are employer-defined free text, so no list.)
 */
export function applyBox12CodeValidation(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  return rows.map((r) => {
    if (r.field_key !== 'box12') return r
    const norm = (r.code ?? '').trim().toUpperCase()
    if (norm === '') return r // amount without a code — nothing to validate
    if (BOX12_CODES.has(norm)) return norm === r.code ? r : { ...r, code: norm }
    return {
      ...r,
      code: norm,
      confidence: Math.min(r.confidence ?? BOX12_CODE_CONFIDENCE, BOX12_CODE_CONFIDENCE),
    }
  })
}

function flagScalarKeys(rows: DocumentFieldInput[], keys: Set<string>): DocumentFieldInput[] {
  if (keys.size === 0) return rows
  return rows.map((r) =>
    keys.has(r.field_key) && r.line_index === 0
      ? {
          ...r,
          confidence: Math.min(
            r.confidence ?? FORM_RULE_CONFLICT_CONFIDENCE,
            FORM_RULE_CONFLICT_CONFIDENCE
          ),
        }
      : r
  )
}

/** SSA-1099: box 5 ≈ box 3 − box 4 when all three amounts are present. */
export function applySsa1099Checks(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  const paid = findScalar(rows, 'benefits_paid')?.value_number ?? null
  const repaid = findScalar(rows, 'benefits_repaid')?.value_number ?? null
  const net = findScalar(rows, 'net_benefits')?.value_number ?? null
  if (paid === null || repaid === null || net === null) return rows
  const expected = paid - repaid
  const tol = Math.max(1, Math.abs(expected) * 0.01)
  if (Math.abs(net - expected) <= tol) return rows
  return flagScalarKeys(rows, new Set(['benefits_paid', 'benefits_repaid', 'net_benefits']))
}

/** 1099-DIV: qualified dividends (1b) must not exceed ordinary dividends (1a). */
export function apply1099DivChecks(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  const ordinary = findScalar(rows, 'total_ordinary_dividends')?.value_number ?? null
  const qualified = findScalar(rows, 'qualified_dividends')?.value_number ?? null
  if (ordinary === null || qualified === null) return rows
  if (qualified <= ordinary + 0.01) return rows
  return flagScalarKeys(rows, new Set(['total_ordinary_dividends', 'qualified_dividends']))
}

/** 1099-NEC: federal withholding should not exceed nonemployee compensation. */
export function apply1099NecChecks(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  const income = findScalar(rows, 'nonemployee_compensation')?.value_number ?? null
  const withheld = findScalar(rows, 'federal_tax_withheld')?.value_number ?? null
  if (income === null || withheld === null || withheld <= 0) return rows
  if (withheld <= income + 0.01) return rows
  return flagScalarKeys(rows, new Set(['nonemployee_compensation', 'federal_tax_withheld']))
}

/** 1099-R: normalize + validate Box 7 distribution code(s). */
export function apply1099RCodeValidation(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  return rows.map((r) => {
    if (r.field_key !== 'distribution_code' || r.line_index !== 0) return r
    const raw = (r.value_text ?? '').trim()
    if (!raw) return r
    const norm = raw.toUpperCase().replace(/[\s,/]+/g, '')
    const next = norm === r.value_text ? r : { ...r, value_text: norm }
    if (isValid1099RDistributionCode(norm)) return next
    return {
      ...next,
      confidence: Math.min(next.confidence ?? DIST_CODE_CONFIDENCE, DIST_CODE_CONFIDENCE),
    }
  })
}

const SA_DIST_CODES = new Set(['1', '2', '3', '4', '5', '6'])

/** 1099-SA: Box 3 is a single digit 1–6. */
export function apply1099SaCodeValidation(rows: DocumentFieldInput[]): DocumentFieldInput[] {
  return rows.map((r) => {
    if (r.field_key !== 'distribution_code' || r.line_index !== 0) return r
    const raw = (r.value_text ?? '').trim()
    if (!raw) return r
    const norm = raw.replace(/\D/g, '').slice(0, 1)
    const next = norm && norm !== r.value_text ? { ...r, value_text: norm } : r
    if (norm && SA_DIST_CODES.has(norm)) return next
    return {
      ...next,
      confidence: Math.min(next.confidence ?? DIST_CODE_CONFIDENCE, DIST_CODE_CONFIDENCE),
    }
  })
}

/**
 * Deterministic per-form sanity checks after flatten/reconcile. Only lowers
 * confidence (or normalizes codes) — never changes amounts. Safe to run on both
 * the single-pass and dual-pass paths.
 */
export function applyFormSanityChecks(
  formType: DocumentType,
  rows: DocumentFieldInput[]
): DocumentFieldInput[] {
  if (rows.length === 0) return rows
  switch (formType) {
    case 'w2':
      return applyBox12CodeValidation(applyW2ArithmeticChecks(rows))
    case 'ssa_1099':
      return applySsa1099Checks(rows)
    case '1099_div':
      return apply1099DivChecks(rows)
    case '1099_nec':
      return apply1099NecChecks(rows)
    case '1099_r':
      return apply1099RCodeValidation(rows)
    case '1099_sa':
      return apply1099SaCodeValidation(rows)
    default:
      return rows
  }
}

/** Concrete 2-letter state code for an entry, or null (blank / "all states"). */
function stateCodeOf(entry: GroupEntry): string | null {
  const s = entryText(entry, 'state')
  return s && /^[a-z]{2}$/.test(s) ? s.toUpperCase() : null
}

/** How many of an entry's sub-fields carry a value (used to pick the fuller of
 * two duplicate rows for the same state/locality). */
function entryFilledCount(entry: GroupEntry): number {
  return entry.rows.filter(
    (r) => r.value_number !== null || (r.value_text ?? '').trim() !== '' || r.value_date !== null
  ).length
}

/** Do two same-anchor entries disagree on any shared sub-field's value? */
function entriesConflict(a: GroupEntry, b: GroupEntry): boolean {
  for (const ra of a.rows) {
    const rb = b.rows.find((r) => r.field_key === ra.field_key)
    if (rb && !sameValue(ra, rb)) return true
  }
  return false
}

export interface StateCoverageResult {
  rows: DocumentFieldInput[]
  /** State codes OCR saw on the page that the model did not return. */
  missingStates: string[]
  /** Count of duplicate state/locality entries collapsed. */
  duplicatesRemoved: number
}

/**
 * Single-pass safety net for the state/local groups. Deterministically:
 *   1. collapses exact-duplicate entries and multiple entries for the SAME
 *      state/locality into one (never lists a state twice), keeping the fuller
 *      row and flagging it for review when the duplicates disagreed;
 *   2. drops an "all states" placeholder when concrete states are present;
 *   3. compares the surviving states against the OCR-detected state codes and,
 *      if OCR clearly saw a state the model omitted, flags the state section for
 *      review (it NEVER fabricates a state row).
 * Distinct states are always preserved; only same-state duplicates are merged.
 */
export function applyStateCoverage(
  rows: DocumentFieldInput[],
  ocrStates?: string[]
): StateCoverageResult {
  const groupRows = rows.filter((r) => parseGroupPath(r.source_json_path) !== null)
  if (groupRows.length === 0) {
    return { rows, missingStates: [], duplicatesRemoved: 0 }
  }
  const nonGroup = rows.filter((r) => parseGroupPath(r.source_json_path) === null)
  const groups = buildGroupEntries(groupRows)

  let duplicatesRemoved = 0
  const modelStates = new Set<string>()
  // Per group, the surviving entries plus whether each must be flagged.
  const survivors: Array<{ groupKey: string; entries: Array<{ rows: DocumentFieldInput[]; flag: boolean }> }> = []

  for (const [groupKey, rawEntries] of groups.entries()) {
    let entries = dedupeBySignature(rawEntries)
    duplicatesRemoved += rawEntries.length - entries.length

    if (groupKey === 'state_tax') {
      const hasConcrete = entries.some(hasConcreteState)
      if (hasConcrete) entries = entries.filter((e) => !isAllStates(e))
    }

    const kept: Array<{ entry: GroupEntry; flag: boolean }> = []
    const byAnchor = new Map<string, { entry: GroupEntry; flag: boolean }>()
    for (const entry of entries) {
      const anchor = entryAnchor(groupKey, entry)
      if (!anchor) {
        kept.push({ entry, flag: false })
        continue
      }
      const existing = byAnchor.get(anchor)
      if (!existing) {
        const rec = { entry, flag: false }
        byAnchor.set(anchor, rec)
        kept.push(rec)
        continue
      }
      // Same state/locality seen twice: keep the fuller entry, flag if they disagree.
      duplicatesRemoved++
      const conflict = entriesConflict(existing.entry, entry)
      if (conflict) existing.flag = true
      if (entryFilledCount(entry) > entryFilledCount(existing.entry)) existing.entry = entry
    }

    if (groupKey === 'state_tax') {
      for (const k of kept) {
        const code = stateCodeOf(k.entry)
        if (code) modelStates.add(code)
      }
    }
    survivors.push({ groupKey, entries: kept.map((k) => ({ rows: k.entry.rows, flag: k.flag })) })
  }

  const missingStates = [...new Set((ocrStates ?? []).map((s) => s.toUpperCase()))].filter(
    (s) => !modelStates.has(s)
  )
  const flagAllStateRows = missingStates.length > 0

  const out: DocumentFieldInput[] = [...nonGroup]
  for (const group of survivors) {
    const flagGroup = group.groupKey === 'state_tax' && flagAllStateRows
    group.entries.forEach((entry, idx) => {
      const flag = entry.flag || flagGroup
      for (const r of entry.rows) {
        out.push(
          flag
            ? {
                ...r,
                line_index: idx,
                confidence: Math.min(r.confidence ?? STATE_COVERAGE_CONFIDENCE, STATE_COVERAGE_CONFIDENCE),
              }
            : { ...r, line_index: idx }
        )
      }
    })
  }

  return { rows: out, missingStates, duplicatesRemoved }
}

interface GroupPathInfo {
  groupKey: string
  index: number
  subKey: string
}

interface GroupEntry {
  groupKey: string
  rows: DocumentFieldInput[]
}

function parseGroupPath(path: string | null): GroupPathInfo | null {
  if (!path) return null
  const m = /^fields\.([a-zA-Z0-9_]+)\.value\[(\d+)\]\.([a-zA-Z0-9_]+)$/.exec(path)
  if (!m) return null
  return { groupKey: m[1], index: Number(m[2]), subKey: m[3] }
}

function valueToken(r: DocumentFieldInput): string {
  if (r.value_number !== null) return `n:${r.value_number.toFixed(2)}`
  if (r.value_date !== null) return `d:${r.value_date}`
  return `t:${(r.value_text ?? '').trim().toLowerCase()}`
}

function entrySignature(entry: GroupEntry): string {
  return entry.rows
    .map((r) => `${r.field_key}=${valueToken(r)}`)
    .sort()
    .join('|')
}

function entryText(entry: GroupEntry, key: string): string | null {
  const row = entry.rows.find((r) => r.field_key === key)
  const text = row?.value_text?.trim() ?? ''
  return text === '' ? null : text.toLowerCase()
}

function isAllStates(entry: GroupEntry): boolean {
  const state = entryText(entry, 'state')
  return state ? state.includes('all state') : false
}

function hasConcreteState(entry: GroupEntry): boolean {
  const state = entryText(entry, 'state')
  if (!state) return false
  if (state.includes('all state')) return false
  return /^[a-z]{2}$/.test(state)
}

function entryAnchor(groupKey: string, entry: GroupEntry): string | null {
  if (groupKey === 'state_tax') {
    const state = entryText(entry, 'state')
    if (!state || state.includes('all state')) return null
    return `state:${state}`
  }
  if (groupKey === 'local_tax') {
    const locality = entryText(entry, 'locality_name')
    return locality ? `locality:${locality}` : null
  }
  return null
}

function capSingleReadConfidence(r: DocumentFieldInput): DocumentFieldInput {
  return { ...r, confidence: Math.min(r.confidence ?? SINGLE_READ_CONFIDENCE, SINGLE_READ_CONFIDENCE) }
}

function buildGroupEntries(rows: DocumentFieldInput[]): Map<string, GroupEntry[]> {
  const groups = new Map<string, Map<number, GroupEntry>>()
  for (const row of rows) {
    const parsed = parseGroupPath(row.source_json_path)
    if (!parsed) continue
    const perGroup = groups.get(parsed.groupKey) ?? new Map<number, GroupEntry>()
    const entry = perGroup.get(parsed.index) ?? { groupKey: parsed.groupKey, rows: [] }
    entry.rows.push(row)
    perGroup.set(parsed.index, entry)
    groups.set(parsed.groupKey, perGroup)
  }

  const out = new Map<string, GroupEntry[]>()
  for (const [groupKey, perIndex] of groups.entries()) {
    const entries = [...perIndex.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
    out.set(groupKey, entries)
  }
  return out
}

function dedupeBySignature(entries: GroupEntry[]): GroupEntry[] {
  const seen = new Set<string>()
  const out: GroupEntry[] = []
  for (const e of entries) {
    const sig = entrySignature(e)
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(e)
  }
  return out
}

/**
 * Merge the primary rows with a verification pass (and optional OCR numbers).
 * Keeps the primary value except when OCR backs the verify pass on a numeric
 * disagreement in a NON-positional field. Rows only the verify pass found (in
 * non-positional fields) are appended, flagged for review, to improve recall.
 */
export function reconcileRows(
  primary: DocumentFieldInput[],
  verify: DocumentFieldInput[],
  schema: FormSchema,
  ocrNumbers?: number[]
): ReconcileResult {
  const keys = deriveKeySets(schema)
  const hasOcr = Array.isArray(ocrNumbers) && ocrNumbers.length > 0

  const primaryGroupRows = primary.filter((r) => parseGroupPath(r.source_json_path) !== null)
  const verifyGroupRows = verify.filter((r) => parseGroupPath(r.source_json_path) !== null)
  const primaryNonGroup = primary.filter((r) => parseGroupPath(r.source_json_path) === null)
  const verifyNonGroup = verify.filter((r) => parseGroupPath(r.source_json_path) === null)

  const vmap = new Map<string, DocumentFieldInput[]>()
  const pushBucket = (k: string, row: DocumentFieldInput): void => {
    const arr = vmap.get(k)
    if (arr) arr.push(row)
    else vmap.set(k, [row])
  }
  for (const r of verifyNonGroup) {
    const key = matchKey(r, keys)
    pushBucket(key, r)
    // For repeating rows, also index by value fallback so duplicates with same
    // code don't collapse and we can still recover verify-only lines.
    if (keys.repeatingKeys.has(r.field_key)) {
      pushBucket(fallbackKeyForRepeating(r), r)
    }
  }
  const consumed = new Set<DocumentFieldInput>()

  const pickMatch = (r: DocumentFieldInput): DocumentFieldInput | undefined => {
    const key = matchKey(r, keys)
    const bucket = vmap.get(key) ?? []
    const available = bucket.filter((x) => !consumed.has(x))
    if (available.length === 0) return undefined
    const exact = available.find((x) => sameValue(r, x))
    const picked = exact ?? available[0]
    consumed.add(picked)
    return picked
  }

  let agreed = 0
  let conflicts = 0
  let singleRead = 0
  let ocrResolved = 0
  let recovered = 0

  const rows: DocumentFieldInput[] = primaryNonGroup.map((r) => {
    const match = pickMatch(r)
    if (!match) {
      singleRead++
      return { ...r, confidence: Math.min(r.confidence ?? SINGLE_READ_CONFIDENCE, SINGLE_READ_CONFIDENCE) }
    }

    const isNumeric = r.data_type === 'number' || match.data_type === 'number'
    const positional = keys.groupSubKeys.has(r.field_key)

    if (sameValue(r, match)) {
      if (isNumeric && hasOcr) {
        if (ocrHas(ocrNumbers!, r.value_number)) {
          agreed++
          return { ...r, confidence: TRIPLE_CONFIDENCE }
        }
        conflicts++
        return { ...r, confidence: CONFLICT_CONFIDENCE }
      }
      agreed++
      return { ...r, confidence: Math.max(r.confidence ?? 0, AGREE_CONFIDENCE) }
    }

    // The two LLM passes disagree. OCR may break the tie for numeric fields, but
    // only where matching is reliable (never for positional group rows, where an
    // adopted value would land in the wrong entry).
    if (isNumeric && hasOcr && !positional) {
      const pHas = ocrHas(ocrNumbers!, r.value_number)
      const vHas = ocrHas(ocrNumbers!, match.value_number)
      if (pHas && !vHas) {
        ocrResolved++
        return { ...r, confidence: OCR_RESOLVED_CONFIDENCE }
      }
      if (vHas && !pHas) {
        ocrResolved++
        return {
          ...r,
          value_number: match.value_number,
          value_text: match.value_text,
          value_date: match.value_date,
          confidence: OCR_RESOLVED_CONFIDENCE,
        }
      }
    }
    conflicts++
    return { ...r, confidence: CONFLICT_CONFIDENCE }
  })

  // Recover rows the verify pass found but the primary missed for non-group fields.
  for (const v of verifyNonGroup) {
    if (consumed.has(v) || keys.groupSubKeys.has(v.field_key)) continue
    consumed.add(v)
    recovered++
    rows.push(capSingleReadConfidence(v))
  }

  // Group fields (state/local) are merged entry-by-entry using semantic matching
  // (signature / anchor), never by raw positional index across passes.
  const primaryGroups = buildGroupEntries(primaryGroupRows)
  const verifyGroups = buildGroupEntries(verifyGroupRows)
  const groupKeys = new Set<string>([...primaryGroups.keys(), ...verifyGroups.keys()])

  for (const groupKey of groupKeys) {
    const pEntries = primaryGroups.get(groupKey) ?? []
    const vEntries = verifyGroups.get(groupKey) ?? []
    const matchedVerify = new Set<number>()
    const mergedEntries: GroupEntry[] = []

    for (const p of pEntries) {
      const pSig = entrySignature(p)
      let matchIndex = vEntries.findIndex((v, i) => !matchedVerify.has(i) && entrySignature(v) === pSig)

      if (matchIndex === -1) {
        const pAnchor = entryAnchor(groupKey, p)
        if (pAnchor) {
          matchIndex = vEntries.findIndex(
            (v, i) => !matchedVerify.has(i) && entryAnchor(groupKey, v) === pAnchor
          )
        }
      }

      if (matchIndex === -1) {
        singleRead += p.rows.length
        mergedEntries.push({ groupKey, rows: p.rows.map(capSingleReadConfidence) })
        continue
      }

      matchedVerify.add(matchIndex)
      const v = vEntries[matchIndex]
      const mergedRows: DocumentFieldInput[] = []

      for (const pr of p.rows) {
        const vr = v.rows.find((r) => r.field_key === pr.field_key)
        if (!vr) {
          singleRead++
          mergedRows.push(capSingleReadConfidence(pr))
          continue
        }
        const isNumeric = pr.data_type === 'number' || vr.data_type === 'number'
        if (sameValue(pr, vr)) {
          if (isNumeric && hasOcr) {
            if (ocrHas(ocrNumbers!, pr.value_number)) {
              agreed++
              mergedRows.push({ ...pr, confidence: TRIPLE_CONFIDENCE })
            } else {
              conflicts++
              mergedRows.push({ ...pr, confidence: CONFLICT_CONFIDENCE })
            }
          } else {
            agreed++
            mergedRows.push({ ...pr, confidence: Math.max(pr.confidence ?? 0, AGREE_CONFIDENCE) })
          }
        } else {
          conflicts++
          mergedRows.push({ ...pr, confidence: CONFLICT_CONFIDENCE })
        }
      }

      for (const vr of v.rows) {
        if (mergedRows.some((r) => r.field_key === vr.field_key)) continue
        recovered++
        mergedRows.push(capSingleReadConfidence(vr))
      }

      mergedEntries.push({ groupKey, rows: mergedRows })
    }

    for (let i = 0; i < vEntries.length; i++) {
      if (matchedVerify.has(i)) continue
      recovered += vEntries[i].rows.length
      mergedEntries.push({ groupKey, rows: vEntries[i].rows.map(capSingleReadConfidence) })
    }

    let normalizedEntries = dedupeBySignature(mergedEntries)
    if (groupKey === 'state_tax') {
      const hasConcrete = normalizedEntries.some(hasConcreteState)
      if (hasConcrete) {
        normalizedEntries = normalizedEntries.filter((e) => !isAllStates(e))
      }
    }

    // Reindex line_index per merged group entry so states/localities never overlap.
    normalizedEntries.forEach((entry, idx) => {
      entry.rows.forEach((r) => rows.push({ ...r, line_index: idx }))
    })
  }

  // Ensure repeating code/value fields have stable, unique line_index values in
  // the merged result. Verify-only recovered rows may otherwise collide with
  // existing primary indices and violate uq_document_fields_line.
  const perFieldNextIndex = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!keys.repeatingKeys.has(row.field_key)) continue
    const next = perFieldNextIndex.get(row.field_key) ?? 0
    rows[i] = { ...row, line_index: next }
    perFieldNextIndex.set(row.field_key, next + 1)
  }

  return { rows, agreed, conflicts, singleRead, ocrResolved, recovered }
}

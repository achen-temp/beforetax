/**
 * IRS Form 1099-R Box 7 distribution codes. Box 7 may contain one code or two
 * codes combined (e.g. "1B", "G"). Used to flag unrecognized codes after
 * extraction — never invents a replacement code.
 */
export const FORM_1099R_DISTRIBUTION_CODES = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'K',
  'L',
  'N',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'W',
] as const

const CODE_SET = new Set<string>(FORM_1099R_DISTRIBUTION_CODES)

/** Normalize printed box-7 text and return whether every 1-char token is a known code. */
export function isValid1099RDistributionCode(raw: string): boolean {
  const cleaned = raw.trim().toUpperCase().replace(/[\s,/]+/g, '')
  if (!cleaned) return true
  // One or two single-character codes, optionally jammed together ("1B", "G7").
  if (cleaned.length === 1) return CODE_SET.has(cleaned)
  if (cleaned.length === 2) {
    return CODE_SET.has(cleaned[0]!) && CODE_SET.has(cleaned[1]!)
  }
  return false
}

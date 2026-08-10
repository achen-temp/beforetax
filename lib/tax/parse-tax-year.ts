const MIN_YEAR = 2000
const MAX_YEAR = 2100

/** Parse a year from a query/cookie/body value; null if missing or invalid. */
export function parseTaxYearParam(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isInteger(n) || n < MIN_YEAR || n > MAX_YEAR) return null
  return n
}

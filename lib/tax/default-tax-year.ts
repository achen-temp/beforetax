/**
 * US individual tax season helpers.
 *
 * W-2s / 1099s for tax year Y are issued in calendar year Y+1. During almost
 * all of calendar year C, firms are collecting and filing the C-1 return — so
 * the product default is always "last calendar year", not "today's year".
 *
 * Example (any day in 2026): defaultTaxYear() === 2025.
 */

/** Filing-season default tax year (= calendar year − 1). */
export function defaultTaxYear(now: Date = new Date()): number {
  return now.getFullYear() - 1
}

/**
 * Years shown in a tax-year picker: the default season plus `priorYears` older
 * seasons (e.g. 2025, 2024, 2023, 2022). Does not include the unfinished
 * upcoming calendar year.
 */
export function selectableTaxYears(
  opts: { now?: Date; priorYears?: number } = {}
): number[] {
  const start = defaultTaxYear(opts.now)
  const prior = opts.priorYears ?? 3
  return Array.from({ length: prior + 1 }, (_, i) => start - i)
}

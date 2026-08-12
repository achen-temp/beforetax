/**
 * CPA intake checklist — "what to bring" for a tax year.
 * Intentionally separate from tax_years.checklist (DocumentType extraction grouping).
 */

export const INTAKE_CATEGORIES = [
  { id: 'all_filers', label: 'For All Filers' },
  { id: 'income', label: 'Income' },
  { id: 'home', label: 'Home & Rental Properties' },
  { id: 'donations', label: 'Donations' },
  { id: 'business', label: 'Business Owners' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'other', label: 'Other Miscellaneous' },
] as const

export type IntakeCategoryId = (typeof INTAKE_CATEGORIES)[number]['id']

/** Bright section headers (tax-prep checklist style). */
export const INTAKE_CATEGORY_HEADER: Record<IntakeCategoryId, string> = {
  all_filers: 'bg-emerald-500 text-white',
  income: 'bg-teal-500 text-white',
  home: 'bg-orange-500 text-white',
  donations: 'bg-violet-500 text-white',
  business: 'bg-sky-500 text-white',
  deductions: 'bg-rose-500 text-white',
  other: 'bg-fuchsia-500 text-white',
}

export type IntakeItemStatus = 'needed' | 'received' | 'na'

/** Firm template row (no per-client status). */
export type IntakeTemplateItem = {
  id: string
  categoryId: IntakeCategoryId
  label: string
}

export type IntakeChecklistItem = IntakeTemplateItem & {
  status: IntakeItemStatus
}

const CATEGORY_IDS = new Set<string>(INTAKE_CATEGORIES.map((c) => c.id))
const STATUSES = new Set<IntakeItemStatus>(['needed', 'received', 'na'])

/** Default firm template matching a typical CPA tax-prep checklist. */
export const DEFAULT_INTAKE_TEMPLATE: IntakeTemplateItem[] = [
  { id: 'prior_return', categoryId: 'all_filers', label: "Copy of last year's tax return" },
  { id: 'ssns', categoryId: 'all_filers', label: 'Social Security numbers (yourself, spouse & dependents)' },
  { id: 'dobs', categoryId: 'all_filers', label: 'Dates of birth (yourself, spouse & dependents)' },
  { id: 'bank_accounts', categoryId: 'all_filers', label: 'Bank account / routing numbers' },
  { id: 'loan_statements', categoryId: 'all_filers', label: 'Loan statements' },
  { id: 'w2s', categoryId: 'income', label: 'W-2s' },
  { id: '1099s', categoryId: 'income', label: '1099s for all forms of income' },
  { id: '1098s', categoryId: 'home', label: '1098s: mortgage, equity, or student loan interest' },
  { id: 'real_estate_taxes', categoryId: 'home', label: 'Paid real estate taxes' },
  { id: 'insurance_premiums_home', categoryId: 'home', label: 'Insurance premiums' },
  { id: 'energy_upgrades', categoryId: 'home', label: 'Energy-efficient upgrade receipts' },
  { id: 'rental_income', categoryId: 'home', label: 'Rental income' },
  { id: 'rental_repairs', categoryId: 'home', label: 'Mileage & receipts for rental repairs & upgrades' },
  { id: 'charity_receipts', categoryId: 'donations', label: 'Charitable contribution receipts' },
  { id: 'volunteer_expenses', categoryId: 'donations', label: 'Volunteer expense deductions' },
  { id: 'tax_id', categoryId: 'business', label: 'Tax ID' },
  { id: 'biz_insurance', categoryId: 'business', label: 'Insurance premiums & expenses' },
  { id: 'biz_income_expenses', categoryId: 'business', label: 'Business income & expenses' },
  { id: 'assets_equipment', categoryId: 'business', label: 'List of assets & equipment' },
  { id: 'mileage_logs', categoryId: 'business', label: 'Mileage logs' },
  { id: 'medical', categoryId: 'deductions', label: 'Medical / dental expenses' },
  { id: 'health_insurance', categoryId: 'deductions', label: 'Health insurance payments' },
  { id: 'ira_hsa', categoryId: 'deductions', label: 'IRA and HSA contributions' },
  { id: 'vehicle_sales_tax', categoryId: 'deductions', label: 'Vehicle purchase sales tax' },
  { id: 'childcare', categoryId: 'deductions', label: 'Childcare expenses' },
  { id: 'job_search', categoryId: 'deductions', label: 'Job search expenses' },
  { id: 'moving', categoryId: 'deductions', label: 'Moving expenses' },
  { id: 'prior_prep_fee', categoryId: 'deductions', label: "Amount paid for last year's tax prep" },
  { id: 'education', categoryId: 'deductions', label: 'Educational expenses (loan interest, supplies, tuition)' },
  { id: 'estimated_taxes', categoryId: 'other', label: 'Estimated tax payments (self-employed)' },
  { id: 'retirement_totals', categoryId: 'other', label: 'IRA / 401(k) total contributions' },
]

export function parseIntakeTemplate(raw: unknown): IntakeTemplateItem[] {
  if (!Array.isArray(raw)) return []
  const items: IntakeTemplateItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const obj = row as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id.trim() : ''
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    const categoryId = typeof obj.categoryId === 'string' ? obj.categoryId : ''
    if (!id || !label) continue
    if (!CATEGORY_IDS.has(categoryId)) continue
    items.push({
      id,
      label,
      categoryId: categoryId as IntakeCategoryId,
    })
  }
  return items
}

/** Firm-saved template, or platform default when unset/empty. */
export function resolveIntakeTemplate(
  saved: IntakeTemplateItem[] | null | undefined
): IntakeTemplateItem[] {
  if (saved && saved.length > 0) return saved
  return DEFAULT_INTAKE_TEMPLATE.map((item) => ({ ...item }))
}

export function createIntakeFromTemplate(
  template: IntakeTemplateItem[] = DEFAULT_INTAKE_TEMPLATE
): IntakeChecklistItem[] {
  return template.map((item) => ({ ...item, status: 'needed' as const }))
}

export function parseIntakeChecklist(raw: unknown): IntakeChecklistItem[] {
  if (!Array.isArray(raw)) return []
  const items: IntakeChecklistItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const obj = row as Record<string, unknown>
    const id = typeof obj.id === 'string' ? obj.id.trim() : ''
    const label = typeof obj.label === 'string' ? obj.label.trim() : ''
    const categoryId = typeof obj.categoryId === 'string' ? obj.categoryId : ''
    const status = obj.status
    if (!id || !label) continue
    if (!CATEGORY_IDS.has(categoryId)) continue
    if (typeof status !== 'string' || !STATUSES.has(status as IntakeItemStatus)) continue
    items.push({
      id,
      label,
      categoryId: categoryId as IntakeCategoryId,
      status: status as IntakeItemStatus,
    })
  }
  return items
}

export function intakeProgress(items: IntakeChecklistItem[]) {
  const active = items.filter((i) => i.status !== 'na')
  const received = active.filter((i) => i.status === 'received').length
  return {
    total: active.length,
    received,
    needed: active.filter((i) => i.status === 'needed').length,
  }
}

export function categoryLabel(categoryId: IntakeCategoryId): string {
  return INTAKE_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId
}

/** Stable-enough id for custom rows added by a CPA. */
export function newIntakeItemId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `custom_${crypto.randomUUID().slice(0, 8)}`
  }
  return `custom_${Date.now().toString(36)}`
}

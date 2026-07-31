import type { DocumentType, FieldDataType } from '@/lib/tax/document-types'

export interface FieldDefinition {
  /** Canonical field key stored in document_fields.field_key */
  key: string
  /** Human label shown in the CPA/client review UI */
  label: string
  /** Extra guidance for the model only (kept out of the UI label). */
  hint?: string
  /** IRS box number/letter, if applicable */
  box?: string
  /** 'group' = a repeating set of related sub-fields (e.g. W-2 per-state boxes) */
  type: FieldDataType | 'group'
  /** Repeating simple field (e.g. W-2 box 12 codes) -> array of { code, value } */
  repeating?: boolean
  /**
   * Fixed positional slots, e.g. W-2 box 12 lines ['a','b','c','d']. Emitted as
   * an object keyed by slot so the model must answer EVERY slot (null when the
   * line is blank) — this forces it to scan each physical line and gives far more
   * consistent recall than an open-ended `repeating` array (which the model can
   * silently truncate). Each slot is a { code, value } pair and flattens to the
   * same rows as `repeating`, so downstream handling is identical.
   */
  slots?: string[]
  /**
   * For slotted fields only: always render EVERY slot in the tax-data view, even
   * empty ones (e.g. box 12 always shows 12a/12b/12c/12d). Slots without this
   * flag are display-optional (e.g. box 14 is shown only when it has lines).
   * Display-only — empty slots are never persisted.
   */
  alwaysShowSlots?: boolean
  /** Sub-fields when type === 'group'. Each group entry shares one line_index. */
  fields?: FieldDefinition[]
}

export interface FormSchema {
  formType: DocumentType
  label: string
  fields: FieldDefinition[]
  /** Optional form-specific guidance appended to the extraction prompt. Use for
   * layout quirks and common misreads that generic rules don't cover. */
  notes?: string[]
  /**
   * Render the COMPLETE box skeleton in the tax-data view for this form: every
   * field/box (and every alwaysShowSlots slot) is listed even when empty, so a
   * blank box reads as "confirmed empty" rather than "silently dropped".
   * Applies only to fully-extracted documents. Display-only; nothing extra is
   * written to the database.
   */
  showEmptyBoxes?: boolean
}

/**
 * Canonical field catalog. Source of truth for what fields each form type
 * extracts. Drives the AI extraction prompt, output validation, and the rows
 * written to document_fields. Add new forms here — no DB migration needed.
 */
export const FIELD_SCHEMAS: Partial<Record<DocumentType, FormSchema>> = {
  // NOTE: W-2 uses a dedicated, box-by-box extraction prompt (buildW2UserPrompt
  // in extraction-prompt.ts) rather than schema `notes`. Keep W-2 layout/misread
  // guidance there so there is a single source of truth.
  w2: {
    formType: 'w2',
    label: 'W-2 — Wage and Tax Statement',
    showEmptyBoxes: true,
    fields: [
      { key: 'employer_name', label: 'Employer name', box: 'c', type: 'text' },
      { key: 'employer_ein', label: 'Employer EIN', box: 'b', type: 'text' },
      { key: 'wages', label: 'Wages, tips, other comp', box: '1', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '2', type: 'number' },
      { key: 'social_security_wages', label: 'Social security wages', box: '3', type: 'number' },
      { key: 'social_security_tax_withheld', label: 'Social security tax withheld', box: '4', type: 'number' },
      { key: 'medicare_wages', label: 'Medicare wages and tips', box: '5', type: 'number' },
      { key: 'medicare_tax_withheld', label: 'Medicare tax withheld', box: '6', type: 'number' },
      { key: 'social_security_tips', label: 'Social security tips', box: '7', type: 'number' },
      { key: 'allocated_tips', label: 'Allocated tips', box: '8', type: 'number' },
      { key: 'dependent_care_benefits', label: 'Dependent care benefits', box: '10', type: 'number' },
      { key: 'nonqualified_plans', label: 'Nonqualified plans', box: '11', type: 'number' },
      { key: 'box12', label: 'Box 12', box: '12', type: 'number', slots: ['a', 'b', 'c', 'd'], alwaysShowSlots: true },
      { key: 'statutory_employee', label: 'Statutory employee', box: '13', type: 'text', hint: 'checkbox: return "true" if marked, otherwise "false"' },
      { key: 'retirement_plan', label: 'Retirement plan', box: '13', type: 'text', hint: 'checkbox: return "true" if marked, otherwise "false"' },
      { key: 'third_party_sick_pay', label: 'Third-party sick pay', box: '13', type: 'text', hint: 'checkbox: return "true" if marked, otherwise "false"' },
      { key: 'box14_other', label: 'Box 14 — Other', box: '14', type: 'number', slots: ['a', 'b', 'c', 'd'], hint: 'put the printed label/description in "code" and the amount in "value"' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 15–17, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state', label: 'State', box: '15', type: 'text' },
          { key: 'state_id', label: "Employer's state ID number", box: '15', type: 'text' },
          { key: 'state_wages', label: 'State wages, tips, etc.', box: '16', type: 'number' },
          { key: 'state_tax_withheld', label: 'State income tax', box: '17', type: 'number' },
        ],
      },
      {
        key: 'local_tax',
        label: 'Local tax (Boxes 18–20, one entry per locality)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'local_wages', label: 'Local wages, tips, etc.', box: '18', type: 'number' },
          { key: 'local_tax_withheld', label: 'Local income tax', box: '19', type: 'number' },
          { key: 'locality_name', label: 'Locality name', box: '20', type: 'text' },
        ],
      },
    ],
  },

  '1099_int': {
    formType: '1099_int',
    label: '1099-INT — Interest Income',
    fields: [
      { key: 'payer_name', label: 'Payer name', type: 'text' },
      { key: 'payer_tin', label: 'Payer TIN', type: 'text' },
      { key: 'interest_income', label: 'Interest income', box: '1', type: 'number' },
      { key: 'early_withdrawal_penalty', label: 'Early withdrawal penalty', box: '2', type: 'number' },
      { key: 'us_savings_bond_interest', label: 'Interest on US savings bonds/Treasury', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'investment_expenses', label: 'Investment expenses', box: '5', type: 'number' },
      { key: 'foreign_tax_paid', label: 'Foreign tax paid', box: '6', type: 'number' },
      { key: 'tax_exempt_interest', label: 'Tax-exempt interest', box: '8', type: 'number' },
    ],
  },

  '1099_div': {
    formType: '1099_div',
    label: '1099-DIV — Dividends and Distributions',
    fields: [
      { key: 'payer_name', label: 'Payer name', type: 'text' },
      { key: 'payer_tin', label: 'Payer TIN', type: 'text' },
      { key: 'total_ordinary_dividends', label: 'Total ordinary dividends', box: '1a', type: 'number' },
      { key: 'qualified_dividends', label: 'Qualified dividends', box: '1b', type: 'number' },
      { key: 'total_capital_gain_distr', label: 'Total capital gain distributions', box: '2a', type: 'number' },
      { key: 'nondividend_distributions', label: 'Nondividend distributions', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'section_199a_dividends', label: 'Section 199A dividends', box: '5', type: 'number' },
      { key: 'foreign_tax_paid', label: 'Foreign tax paid', box: '7', type: 'number' },
      { key: 'exempt_interest_dividends', label: 'Exempt-interest dividends', box: '12', type: 'number' },
    ],
  },

  '1099_nec': {
    formType: '1099_nec',
    label: '1099-NEC — Nonemployee Compensation',
    fields: [
      { key: 'payer_name', label: 'Payer name', type: 'text' },
      { key: 'payer_tin', label: 'Payer TIN', type: 'text' },
      { key: 'nonemployee_compensation', label: 'Nonemployee compensation', box: '1', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 5–7, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state_tax_withheld', label: 'State tax withheld', box: '5', type: 'number' },
          { key: 'state', label: 'State', box: '6', type: 'text' },
          { key: 'state_id', label: "Payer's state number", box: '6', type: 'text' },
          { key: 'state_income', label: 'State income', box: '7', type: 'number' },
        ],
      },
    ],
  },

  '1098': {
    formType: '1098',
    label: '1098 — Mortgage Interest Statement',
    fields: [
      { key: 'lender_name', label: 'Lender name', type: 'text' },
      { key: 'lender_tin', label: 'Lender TIN', type: 'text' },
      { key: 'mortgage_interest_received', label: 'Mortgage interest received', box: '1', type: 'number' },
      { key: 'outstanding_principal', label: 'Outstanding mortgage principal', box: '2', type: 'number' },
      { key: 'mortgage_origination_date', label: 'Mortgage origination date', box: '3', type: 'date' },
      { key: 'refund_of_overpaid_interest', label: 'Refund of overpaid interest', box: '4', type: 'number' },
      { key: 'mortgage_insurance_premiums', label: 'Mortgage insurance premiums', box: '5', type: 'number' },
      { key: 'points_paid', label: 'Points paid on purchase', box: '6', type: 'number' },
      { key: 'property_address', label: 'Property address', box: '8', type: 'text' },
    ],
  },
}

export function getFormSchema(formType: DocumentType): FormSchema | undefined {
  return FIELD_SCHEMAS[formType]
}

export function getSupportedFormTypes(): DocumentType[] {
  return Object.keys(FIELD_SCHEMAS) as DocumentType[]
}

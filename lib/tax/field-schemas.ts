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
  /**
   * Specialized editor for the review UI:
   *   'state' -> 2-letter US state dropdown (stored value is the code).
   *   'yesno' -> Yes / No dropdown for checkbox fields (stored as "true"/"false").
   * Display/edit only — extraction shape is unchanged.
   */
  inputType?: 'state' | 'yesno'
  /**
   * Slotted fields whose CODE is meaningful and editable in the review UI:
   *   'w2box12' -> a validated dropdown of IRS Box-12 codes (label = "Code X").
   *   'text'    -> a free-text description (e.g. W-2 Box 14 "SUI"); the label is
   *                the description itself.
   * The field key never changes; only the per-line code + amount are edited.
   */
  codeInput?: 'w2box12' | 'text'
  /**
   * A reserved/obsolete box that never carries data (e.g. W-2 box 9, grayed out
   * on the current IRS form). It is EXCLUDED from extraction (not in the json
   * schema or prompt, never persisted) but still rendered in the tax-data view as
   * an always-empty, grayed placeholder so the box layout is visibly complete.
   */
  reserved?: boolean
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

/** Shared identity block used on most information returns (payer / recipient). */
function infoReturnIdentity(opts?: {
  payerLabel?: string
  payerTinLabel?: string
}): FieldDefinition[] {
  return [
    {
      key: 'tax_year',
      label: 'Tax year',
      type: 'text',
      hint: 'the 4-digit year printed on the form as a string, e.g. "2025"',
    },
    { key: 'payer_name', label: opts?.payerLabel ?? 'Payer name', type: 'text' },
    { key: 'payer_tin', label: opts?.payerTinLabel ?? 'Payer TIN', type: 'text' },
    { key: 'recipient_name', label: 'Recipient name', type: 'text' },
    {
      key: 'recipient_tin',
      label: 'Recipient TIN',
      type: 'text',
      hint:
        'transcribe the recipient SSN/TIN EXACTLY as printed: if the form shows a full number, return the full number (keep dashes); if digits are masked (X, *, •), return the masked form with only the visible last 4 (e.g. "•••-••-1234"). Never invent missing digits.',
    },
  ]
}

/** Standard state income-tax rows on 1099-NEC / 1099-MISC / 1099-R / 1099-K. */
function stateTaxGroup(boxes: { withheld: string; state: string; stateId: string; income: string }): FieldDefinition {
  return {
    key: 'state_tax',
    label: `State tax (Boxes ${boxes.withheld}–${boxes.income}, one entry per state)`,
    type: 'group',
    repeating: true,
    fields: [
      { key: 'state_tax_withheld', label: 'State tax withheld', box: boxes.withheld, type: 'number' },
      { key: 'state', label: 'State', box: boxes.state, type: 'text', inputType: 'state' },
      { key: 'state_id', label: "Payer's state number", box: boxes.stateId, type: 'text' },
      { key: 'state_income', label: 'State income', box: boxes.income, type: 'number' },
    ],
  }
}

/**
 * Canonical field catalog. Source of truth for what fields each form type
 * extracts. Drives the AI extraction prompt, output validation, and the rows
 * written to document_fields. Add new forms here — no DB migration needed.
 *
 * Phase 1 “supported” forms (schema present = extractable): W-2, 1099-NEC,
 * 1099-INT, 1099-DIV, 1099-G, 1099-SA, 1099-R, SSA-1099, 1098, 1099-MISC,
 * 1099-K, 1098-T, 1095-A. Brokerage composites / K-1s stay out until they meet
 * the same bar.
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
      { key: 'tax_year', label: 'Tax year', type: 'text', hint: 'the 4-digit year printed on the form as a string, e.g. "2025"' },
      { key: 'employee_name', label: 'Employee name', box: 'e', type: 'text' },
      {
        key: 'employee_ssn',
        label: 'Employee SSN',
        box: 'a',
        type: 'text',
        hint:
          'transcribe box a EXACTLY as printed: full SSN if unmasked (keep dashes); if masked (X, *, •), return the masked form with only the visible last 4 (e.g. "•••-••-1234"). Never invent missing digits.',
      },
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
      { key: 'box9', label: 'Reserved', box: '9', type: 'text', reserved: true },
      { key: 'dependent_care_benefits', label: 'Dependent care benefits', box: '10', type: 'number' },
      { key: 'nonqualified_plans', label: 'Nonqualified plans', box: '11', type: 'number' },
      { key: 'box12', label: 'Box 12', box: '12', type: 'number', slots: ['a', 'b', 'c', 'd'], alwaysShowSlots: true, codeInput: 'w2box12' },
      { key: 'statutory_employee', label: 'Statutory employee', box: '13', type: 'text', inputType: 'yesno', hint: 'checkbox: return "true" if marked, otherwise "false"' },
      { key: 'retirement_plan', label: 'Retirement plan', box: '13', type: 'text', inputType: 'yesno', hint: 'checkbox: return "true" if marked, otherwise "false"' },
      { key: 'third_party_sick_pay', label: 'Third-party sick pay', box: '13', type: 'text', inputType: 'yesno', hint: 'checkbox: return "true" if marked, otherwise "false"' },
      { key: 'box14_other', label: 'Box 14 — Other', box: '14', type: 'number', slots: ['a', 'b', 'c', 'd'], alwaysShowSlots: true, codeInput: 'text', hint: 'put the printed label/description in "code" and the amount in "value"' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 15–17, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state', label: 'State', box: '15', type: 'text', inputType: 'state' },
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

  '1099_nec': {
    formType: '1099_nec',
    label: '1099-NEC — Nonemployee Compensation',
    showEmptyBoxes: true,
    notes: [
      'Confirm the form title is Form 1099-NEC (not 1099-MISC). If it is MISC, set form_type_mismatch true.',
      'Box 1 is nonemployee compensation — the primary amount. Do not confuse with MISC box 1 (rents).',
      'Box 2 is a checkbox ("Payer made direct sales of $5,000 or more") — return "true" or "false", never an amount.',
      'State section (boxes 5–7): one object per state row; union across copies; never merge two states.',
      'Account number (if printed) goes in document_identity.account_number_last4 (last 4 only).',
    ],
    fields: [
      ...infoReturnIdentity(),
      { key: 'nonemployee_compensation', label: 'Nonemployee compensation', box: '1', type: 'number' },
      {
        key: 'direct_sales',
        label: 'Payer made direct sales of $5,000 or more',
        box: '2',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      stateTaxGroup({ withheld: '5', state: '6', stateId: '6', income: '7' }),
    ],
  },

  '1099_int': {
    formType: '1099_int',
    label: '1099-INT — Interest Income',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-INT. Brokerage composite pages that only summarize interest may still be INT if boxes match; if the page is clearly 1099-DIV or a full composite without INT boxes, set form_type_mismatch.',
      'Box 1 is taxable interest. Box 8 is tax-exempt interest — do not put tax-exempt amounts in box 1.',
      'Box 3 (US savings bonds/Treasury) is often blank; leave null when blank.',
      'FATCA filing requirement is a checkbox if present — ignore unless we have a field for it.',
    ],
    fields: [
      ...infoReturnIdentity(),
      { key: 'interest_income', label: 'Interest income', box: '1', type: 'number' },
      { key: 'early_withdrawal_penalty', label: 'Early withdrawal penalty', box: '2', type: 'number' },
      { key: 'us_savings_bond_interest', label: 'Interest on US savings bonds/Treasury', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'investment_expenses', label: 'Investment expenses', box: '5', type: 'number' },
      { key: 'foreign_tax_paid', label: 'Foreign tax paid', box: '6', type: 'number' },
      { key: 'foreign_country', label: 'Foreign country or US possession', box: '7', type: 'text' },
      { key: 'tax_exempt_interest', label: 'Tax-exempt interest', box: '8', type: 'number' },
      { key: 'specified_private_activity_bond_interest', label: 'Specified private activity bond interest', box: '9', type: 'number' },
      { key: 'market_discount', label: 'Market discount', box: '10', type: 'number' },
      { key: 'bond_premium', label: 'Bond premium', box: '11', type: 'number' },
      { key: 'bond_premium_on_treasury', label: 'Bond premium on Treasury obligations', box: '12', type: 'number' },
      { key: 'bond_premium_on_tax_exempt', label: 'Bond premium on tax-exempt bond', box: '13', type: 'number' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 15–17, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state', label: 'State', box: '15', type: 'text', inputType: 'state' },
          { key: 'state_id', label: 'State identification no.', box: '16', type: 'text' },
          { key: 'state_tax_withheld', label: 'State tax withheld', box: '17', type: 'number' },
        ],
      },
    ],
  },

  '1099_div': {
    formType: '1099_div',
    label: '1099-DIV — Dividends and Distributions',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-DIV. Box 1b (qualified dividends) must not exceed box 1a (total ordinary dividends) when both are printed.',
      'Capital gain boxes 2a–2f are often mostly blank — return null for blank boxes, not 0, unless 0.00 is printed.',
      'Do not pull transaction-level brokerage detail; only the DIV form boxes.',
    ],
    fields: [
      ...infoReturnIdentity(),
      { key: 'total_ordinary_dividends', label: 'Total ordinary dividends', box: '1a', type: 'number' },
      { key: 'qualified_dividends', label: 'Qualified dividends', box: '1b', type: 'number' },
      { key: 'total_capital_gain_distr', label: 'Total capital gain distributions', box: '2a', type: 'number' },
      { key: 'unrecaptured_section_1250_gain', label: 'Unrecaptured section 1250 gain', box: '2b', type: 'number' },
      { key: 'section_1202_gain', label: 'Section 1202 gain', box: '2c', type: 'number' },
      { key: 'collectibles_gain', label: 'Collectibles (28%) gain', box: '2d', type: 'number' },
      { key: 'section_897_ordinary_dividends', label: 'Section 897 ordinary dividends', box: '2e', type: 'number' },
      { key: 'section_897_capital_gain', label: 'Section 897 capital gain', box: '2f', type: 'number' },
      { key: 'nondividend_distributions', label: 'Nondividend distributions', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'section_199a_dividends', label: 'Section 199A dividends', box: '5', type: 'number' },
      { key: 'investment_expenses', label: 'Investment expenses', box: '6', type: 'number' },
      { key: 'foreign_tax_paid', label: 'Foreign tax paid', box: '7', type: 'number' },
      { key: 'foreign_country', label: 'Foreign country or US possession', box: '8', type: 'text' },
      { key: 'cash_liquidation_distributions', label: 'Cash liquidation distributions', box: '9', type: 'number' },
      { key: 'noncash_liquidation_distributions', label: 'Noncash liquidation distributions', box: '10', type: 'number' },
      { key: 'exempt_interest_dividends', label: 'Exempt-interest dividends', box: '12', type: 'number' },
      { key: 'specified_private_activity_bond_interest_dividends', label: 'Specified private activity bond interest dividends', box: '13', type: 'number' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 14–16, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state', label: 'State', box: '14', type: 'text', inputType: 'state' },
          { key: 'state_id', label: 'State identification no.', box: '15', type: 'text' },
          { key: 'state_tax_withheld', label: 'State tax withheld', box: '16', type: 'number' },
        ],
      },
    ],
  },

  '1099_g': {
    formType: '1099_g',
    label: '1099-G — Certain Government Payments',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-G (Certain Government Payments). Common issuers are state unemployment agencies and state tax departments — not employers (those use W-2) and not SSA (use ssa_1099).',
      'Box 1 is unemployment compensation (often the only filled amount). Box 2 is state/local income tax refunds, credits, or offsets — a different concept; do not put unemployment in box 2.',
      'Box 3 is the tax year that box 2 relates to (YYYY), not the form\'s calendar year. Leave null when blank or when box 2 is blank.',
      'Box 8 is a checkbox (trade or business income related to box 2) — return "true"/"false".',
      'State section: current IRS layout uses boxes 11a/11b/12; older copies may label them 10a/10b/11 — map by meaning (state / state ID / state tax withheld).',
    ],
    fields: [
      ...infoReturnIdentity({ payerLabel: 'Payer name', payerTinLabel: 'Payer TIN' }),
      { key: 'unemployment_compensation', label: 'Unemployment compensation', box: '1', type: 'number' },
      {
        key: 'state_local_tax_refunds',
        label: 'State or local income tax refunds, credits, or offsets',
        box: '2',
        type: 'number',
      },
      {
        key: 'box2_tax_year',
        label: 'Box 2 amount is for tax year',
        box: '3',
        type: 'text',
        hint: 'YYYY year that box 2 relates to, e.g. "2024"; null if blank',
      },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'rtaa_payments', label: 'RTAA payments', box: '5', type: 'number' },
      { key: 'taxable_grants', label: 'Taxable grants', box: '6', type: 'number' },
      { key: 'agriculture_payments', label: 'Agriculture payments', box: '7', type: 'number' },
      {
        key: 'trade_or_business_income',
        label: 'Check if box 2 is trade or business income',
        box: '8',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      { key: 'market_gain', label: 'Market gain', box: '9', type: 'number' },
      { key: 'family_leave_benefits', label: 'Family leave benefits', box: '10', type: 'number' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 11a–12, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state', label: 'State', box: '11a', type: 'text', inputType: 'state' },
          { key: 'state_id', label: "Payer's state identification no.", box: '11b', type: 'text' },
          { key: 'state_tax_withheld', label: 'State income tax withheld', box: '12', type: 'number' },
        ],
      },
    ],
  },

  '1099_sa': {
    formType: '1099_sa',
    label: '1099-SA — Distributions From an HSA, Archer MSA, or Medicare Advantage MSA',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-SA (HSA/MSA distributions). Do not confuse with 5498-SA (contributions / year-end FMV) or 1099-R (retirement).',
      'Box 1 is the gross distribution. Box 2 (earnings on excess contributions) is included in box 1 when present — do not invent box 2.',
      'Box 3 distribution code is a single digit 1–6 (1 normal, 2 excess contributions, 3 disability, 4 death other than 6, 5 prohibited transaction, 6 death after year of death to nonspouse).',
      'Box 5: exactly one of HSA / Archer MSA / MA MSA should be checked — return which one as account_type text ("HSA", "Archer MSA", or "MA MSA").',
    ],
    fields: [
      ...infoReturnIdentity({ payerLabel: 'Trustee / payer name', payerTinLabel: 'Trustee / payer TIN' }),
      { key: 'gross_distribution', label: 'Gross distribution', box: '1', type: 'number' },
      {
        key: 'earnings_on_excess_contributions',
        label: 'Earnings on excess contributions',
        box: '2',
        type: 'number',
        hint: 'included in box 1 when present; null if blank',
      },
      {
        key: 'distribution_code',
        label: 'Distribution code',
        box: '3',
        type: 'text',
        hint: 'single digit 1–6 as printed',
      },
      { key: 'fmv_on_date_of_death', label: 'FMV on date of death', box: '4', type: 'number' },
      {
        key: 'account_type',
        label: 'Account type (HSA / Archer MSA / MA MSA)',
        box: '5',
        type: 'text',
        hint: 'which checkbox is marked: "HSA", "Archer MSA", or "MA MSA"',
      },
    ],
  },

  '1099_r': {
    formType: '1099_r',
    label: '1099-R — Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans, IRAs, Insurance Contracts, etc.',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-R (not SSA-1099). SSA benefits use ssa_1099.',
      'Box 7 distribution code(s): 1–2 character IRS codes (e.g. "7", "G", "1B"). Return exactly as printed, uppercase letters. Do not invent codes.',
      'Box 7 IRA/SEP/SIMPLE is a separate checkbox next to the codes — return "true"/"false".',
      'Box 2b has two checkboxes: taxable amount not determined, and total distribution — capture each.',
      'Box 2a may be blank when taxable amount is not determined; use null, do not copy box 1.',
      'State/local rows: one object per distinct state or locality line.',
    ],
    fields: [
      ...infoReturnIdentity(),
      { key: 'gross_distribution', label: 'Gross distribution', box: '1', type: 'number' },
      { key: 'taxable_amount', label: 'Taxable amount', box: '2a', type: 'number' },
      {
        key: 'taxable_amount_not_determined',
        label: 'Taxable amount not determined',
        box: '2b',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      {
        key: 'total_distribution',
        label: 'Total distribution',
        box: '2b',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      { key: 'capital_gain', label: 'Capital gain (included in box 2a)', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'employee_contributions', label: 'Employee contributions / designated Roth contributions or insurance premiums', box: '5', type: 'number' },
      { key: 'net_unrealized_appreciation', label: 'Net unrealized appreciation in employer\'s securities', box: '6', type: 'number' },
      {
        key: 'distribution_code',
        label: 'Distribution code(s)',
        box: '7',
        type: 'text',
        hint: 'IRS box 7 code(s) exactly as printed, uppercase (e.g. "7", "G", "1B")',
      },
      {
        key: 'ira_sep_simple',
        label: 'IRA/SEP/SIMPLE',
        box: '7',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox next to box 7: return "true" if marked, otherwise "false"',
      },
      { key: 'other', label: 'Other', box: '8', type: 'number' },
      { key: 'percent_of_total_distribution', label: 'Your percentage of total distribution', box: '9a', type: 'number' },
      { key: 'total_employee_contributions', label: 'Total employee contributions', box: '9b', type: 'number' },
      { key: 'amount_allocable_to_irr_within_5_years', label: 'Amount allocable to IRR within 5 years', box: '10', type: 'number' },
      { key: 'first_year_of_desig_roth', label: '1st year of desig. Roth contrib.', box: '11', type: 'text' },
      {
        key: 'state_tax',
        label: 'State tax (Boxes 12–14, one entry per state)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'state_tax_withheld', label: 'State tax withheld', box: '12', type: 'number' },
          { key: 'state', label: 'State', box: '13', type: 'text', inputType: 'state' },
          { key: 'state_id', label: "Payer's state no.", box: '13', type: 'text' },
          { key: 'state_distribution', label: 'State distribution', box: '14', type: 'number' },
        ],
      },
      {
        key: 'local_tax',
        label: 'Local tax (Boxes 15–17, one entry per locality)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'local_tax_withheld', label: 'Local tax withheld', box: '15', type: 'number' },
          { key: 'locality_name', label: 'Name of locality', box: '16', type: 'text' },
          { key: 'local_distribution', label: 'Local distribution', box: '17', type: 'number' },
        ],
      },
    ],
  },

  ssa_1099: {
    formType: 'ssa_1099',
    label: 'SSA-1099 — Social Security Benefit Statement',
    showEmptyBoxes: true,
    notes: [
      'This is Form SSA-1099 (Social Security Benefit Statement), NOT Form 1099-R.',
      'Box 5 (net benefits) should equal box 3 (benefits paid) minus box 4 (benefits repaid) when all three are printed.',
      'Do not treat Medicare premium amounts on the form description as box 3 unless they are in the benefits-paid box.',
      'Recipient is the beneficiary; payer is Social Security Administration — still fill payer_name if printed.',
    ],
    fields: [
      {
        key: 'tax_year',
        label: 'Tax year',
        type: 'text',
        hint: 'the 4-digit year printed on the form as a string, e.g. "2025"',
      },
      { key: 'beneficiary_name', label: 'Beneficiary name', type: 'text' },
      {
        key: 'beneficiary_ssn',
        label: 'Beneficiary SSN',
        type: 'text',
        hint:
          'transcribe EXACTLY as printed: full SSN if unmasked; if masked (X, *, •), return the masked form with only the visible last 4. Never invent missing digits.',
      },
      { key: 'benefits_paid', label: 'Benefits paid', box: '3', type: 'number' },
      { key: 'benefits_repaid', label: 'Benefits repaid to SSA', box: '4', type: 'number' },
      { key: 'net_benefits', label: 'Net benefits', box: '5', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Voluntary federal income tax withheld', box: '6', type: 'number' },
      {
        key: 'claim_number',
        label: 'Claim number (last 4 of suffix if long)',
        type: 'text',
        hint: 'claim number as printed; if very long you may keep it as printed text',
      },
    ],
  },

  '1098': {
    formType: '1098',
    label: '1098 — Mortgage Interest Statement',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1098 (mortgage interest), not 1098-T or 1098-E.',
      'Box 1 is mortgage interest received by the lender — primary amount for the return.',
      'Borrower is the recipient; lender/servicer is the payer-side party (use lender_* fields).',
      'Box 8/9 property address: capture the street address as printed; do not invent.',
    ],
    fields: [
      {
        key: 'tax_year',
        label: 'Tax year',
        type: 'text',
        hint: 'the 4-digit year printed on the form as a string, e.g. "2025"',
      },
      { key: 'lender_name', label: 'Lender / filer name', type: 'text' },
      { key: 'lender_tin', label: 'Lender TIN', type: 'text' },
      { key: 'borrower_name', label: 'Borrower name', type: 'text' },
      {
        key: 'borrower_tin',
        label: 'Borrower TIN',
        type: 'text',
        hint:
          'transcribe EXACTLY as printed: full SSN/TIN if unmasked (keep dashes); if masked (X, *, •), return the masked form with only the visible last 4. Never invent missing digits.',
      },
      { key: 'mortgage_interest_received', label: 'Mortgage interest received from payer(s)/borrower(s)', box: '1', type: 'number' },
      { key: 'outstanding_principal', label: 'Outstanding mortgage principal', box: '2', type: 'number' },
      { key: 'mortgage_origination_date', label: 'Mortgage origination date', box: '3', type: 'date' },
      { key: 'refund_of_overpaid_interest', label: 'Refund of overpaid interest', box: '4', type: 'number' },
      { key: 'mortgage_insurance_premiums', label: 'Mortgage insurance premiums', box: '5', type: 'number' },
      { key: 'points_paid', label: 'Points paid on purchase of principal residence', box: '6', type: 'number' },
      {
        key: 'address_same_as_borrower',
        label: 'Address or description of property securing mortgage (same as borrower)',
        box: '7',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox if present: return "true" if marked, otherwise "false"',
      },
      { key: 'property_address', label: 'Address or description of property securing mortgage', box: '8', type: 'text' },
      { key: 'number_of_properties', label: 'Number of properties securing the mortgage', box: '9', type: 'number' },
      { key: 'other', label: 'Other', box: '10', type: 'text' },
      { key: 'mortgage_acquisition_date', label: 'Mortgage acquisition date', box: '11', type: 'date' },
    ],
  },

  '1099_misc': {
    formType: '1099_misc',
    label: '1099-MISC — Miscellaneous Information',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-MISC (not 1099-NEC). Nonemployee compensation belongs on NEC, not MISC.',
      'Common boxes: 1 rents, 2 royalties, 3 other income, 4 federal withheld. Leave unused boxes null.',
      'Box 7 direct sales is a checkbox — "true"/"false".',
    ],
    fields: [
      ...infoReturnIdentity(),
      { key: 'rents', label: 'Rents', box: '1', type: 'number' },
      { key: 'royalties', label: 'Royalties', box: '2', type: 'number' },
      { key: 'other_income', label: 'Other income', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      { key: 'fishing_boat_proceeds', label: 'Fishing boat proceeds', box: '5', type: 'number' },
      { key: 'medical_healthcare_payments', label: 'Medical and health care payments', box: '6', type: 'number' },
      {
        key: 'direct_sales',
        label: 'Payer made direct sales of $5,000 or more',
        box: '7',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      { key: 'substitute_payments', label: 'Substitute payments in lieu of dividends or interest', box: '8', type: 'number' },
      { key: 'crop_insurance_proceeds', label: 'Crop insurance proceeds', box: '9', type: 'number' },
      { key: 'gross_proceeds_attorney', label: 'Gross proceeds paid to an attorney', box: '10', type: 'number' },
      { key: 'fish_purchased_for_resale', label: 'Fish purchased for resale', box: '11', type: 'number' },
      { key: 'section_409a_deferrals', label: 'Section 409A deferrals', box: '12', type: 'number' },
      { key: 'excess_golden_parachute', label: 'Excess golden parachute payments', box: '14', type: 'number' },
      { key: 'nonqualified_deferred_compensation', label: 'Nonqualified deferred compensation', box: '15', type: 'number' },
      stateTaxGroup({ withheld: '16', state: '17', stateId: '17', income: '18' }),
    ],
  },

  '1099_k': {
    formType: '1099_k',
    label: '1099-K — Payment Card and Third Party Network Transactions',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1099-K. Box 1a is the gross amount of payment card/third party network transactions.',
      'PSE vs PES names: capture the filer/payer name in payer_name as printed.',
      'Monthly breakdown boxes (1a Jan–Dec on some layouts) — if a single annual 1a is printed, fill gross_amount only; leave month fields null when not printed as separate boxes.',
    ],
    fields: [
      ...infoReturnIdentity({ payerLabel: 'Filer name', payerTinLabel: 'Filer TIN' }),
      { key: 'gross_amount', label: 'Gross amount of payment card/third party network transactions', box: '1a', type: 'number' },
      { key: 'card_not_present', label: 'Card not present transactions', box: '1b', type: 'number' },
      { key: 'merchant_category_code', label: 'Merchant category code', box: '2', type: 'text' },
      { key: 'number_of_payment_transactions', label: 'Number of payment transactions', box: '3', type: 'number' },
      { key: 'federal_tax_withheld', label: 'Federal income tax withheld', box: '4', type: 'number' },
      stateTaxGroup({ withheld: '5', state: '6', stateId: '6', income: '7' }),
    ],
  },

  '1098_t': {
    formType: '1098_t',
    label: '1098-T — Tuition Statement',
    showEmptyBoxes: true,
    notes: [
      'Confirm Form 1098-T. Student is the recipient; institution is the filer (payer_name).',
      'Box 1 is payments received for qualified tuition. Box 5 is scholarships or grants.',
      'Boxes 7–9 are checkboxes — return "true"/"false".',
    ],
    fields: [
      ...infoReturnIdentity({ payerLabel: 'Institution name', payerTinLabel: 'Institution TIN' }),
      { key: 'payments_received_tuition', label: 'Payments received for qualified tuition and related expenses', box: '1', type: 'number' },
      { key: 'adjustments_prior_year', label: 'Adjustments made for a prior year', box: '4', type: 'number' },
      { key: 'scholarships_grants', label: 'Scholarships or grants', box: '5', type: 'number' },
      { key: 'adjustments_scholarships', label: 'Adjustments to scholarships or grants for a prior year', box: '6', type: 'number' },
      {
        key: 'amounts_include_jan_mar',
        label: 'Amount in box 1 or 2 includes amounts for an academic period beginning January–March of next year',
        box: '7',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      {
        key: 'at_least_half_time',
        label: 'At least half-time student',
        box: '8',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      {
        key: 'graduate_student',
        label: 'Graduate student',
        box: '9',
        type: 'text',
        inputType: 'yesno',
        hint: 'checkbox: return "true" if marked, otherwise "false"',
      },
      { key: 'insurance_contract_reimburse', label: 'Insurance contract reimbursements/refunds', box: '10', type: 'number' },
    ],
  },

  '1095_a': {
    formType: '1095_a',
    label: '1095-A — Health Insurance Marketplace Statement',
    showEmptyBoxes: true,
    notes: [
      'Form 1095-A Part III is a month-by-month grid (Jan–Dec) plus annual totals. Extract the ANNUAL TOTAL row into the annual_* fields, and each month into monthly_coverage group entries.',
      'For monthly_coverage: return up to 12 objects (January=1 … December=12) using month_number. Skip months with no coverage if entirely blank; if a month shows zeros, use 0.',
      'Policy start/end dates and marketplace ID are identity — do not invent.',
    ],
    fields: [
      {
        key: 'tax_year',
        label: 'Tax year',
        type: 'text',
        hint: 'the 4-digit coverage year printed on the form as a string, e.g. "2025"',
      },
      { key: 'marketplace_identifier', label: 'Marketplace identifier', type: 'text' },
      { key: 'policy_number', label: 'Policy number', type: 'text' },
      { key: 'policy_issuer_name', label: 'Policy issuer name', type: 'text' },
      { key: 'recipient_name', label: 'Recipient name', type: 'text' },
      {
        key: 'recipient_tin',
        label: 'Recipient TIN',
        type: 'text',
        hint:
          'transcribe EXACTLY as printed: full SSN/TIN if unmasked; if masked (X, *, •), return the masked form with only the visible last 4. Never invent missing digits.',
      },
      { key: 'policy_start_date', label: 'Policy start date', type: 'date' },
      { key: 'policy_termination_date', label: 'Policy termination date', type: 'date' },
      { key: 'annual_enrollment_premiums', label: 'Annual totals — monthly enrollment premiums', box: 'A', type: 'number' },
      { key: 'annual_slcsp', label: 'Annual totals — monthly SLCSP premium', box: 'B', type: 'number' },
      { key: 'annual_advance_ptc', label: 'Annual totals — monthly advance payment of PTC', box: 'C', type: 'number' },
      {
        key: 'monthly_coverage',
        label: 'Part III monthly amounts (one entry per month)',
        type: 'group',
        repeating: true,
        fields: [
          {
            key: 'month_number',
            label: 'Month (1–12)',
            type: 'number',
            hint: '1=January … 12=December',
          },
          { key: 'enrollment_premiums', label: 'Enrollment premiums', box: 'A', type: 'number' },
          { key: 'slcsp_premium', label: 'SLCSP premium', box: 'B', type: 'number' },
          { key: 'advance_ptc', label: 'Advance payment of PTC', box: 'C', type: 'number' },
        ],
      },
    ],
  },

  /**
   * Prior-year Form 1040 package (or software printout). Narrow extract only:
   * household / identity for prefilling client info — NOT income/deduction boxes.
   */
  prior_return: {
    formType: 'prior_return',
    label: "Prior-year tax return — Form 1040 (personal info)",
    notes: [
      'This document is a PRIOR-YEAR Form 1040 / U.S. Individual Income Tax Return (or a tax-software printout of one), often many pages with Schedules.',
      'Extract ONLY personal/household identity from Form 1040 page 1 (and refund direct-deposit lines if present on page 2). Do NOT extract wages, AGI line amounts beyond what is listed below, Schedule C/E/D details, credits, or other tax computation boxes.',
      'If the upload is clearly a W-2, 1099, or other information return (not a 1040 return package), set form_type_mismatch true.',
      'filing_status: map the checked filing-status box to one of: "single", "mfj", "mfs", "hoh", "qw". If unclear, return the printed label as text.',
      'SSNs: transcribe EXACTLY as printed (full or masked). Never invent missing digits.',
      'dependents: one object per dependent listed on Form 1040; return [] if none.',
      'Direct-deposit fields are only for a REFUND routing/account printed on the return; leave null if blank or if the return shows amount owed with no deposit info.',
    ],
    fields: [
      {
        key: 'tax_year',
        label: 'Tax year of this return',
        type: 'text',
        hint: 'the 4-digit tax year the Form 1040 is for (e.g. "2024"), as a string',
      },
      {
        key: 'filing_status',
        label: 'Filing status',
        type: 'text',
        hint: 'one of: single, mfj, mfs, hoh, qw — from the checked box on Form 1040',
      },
      { key: 'taxpayer_name', label: 'Taxpayer name', type: 'text' },
      {
        key: 'taxpayer_ssn',
        label: 'Taxpayer SSN',
        type: 'text',
        hint:
          'transcribe EXACTLY as printed: full SSN if unmasked (keep dashes); if masked (X, *, •), return the masked form with only the visible last 4. Never invent missing digits.',
      },
      {
        key: 'taxpayer_dob',
        label: 'Taxpayer date of birth',
        type: 'date',
        hint: 'only if printed on the return package; otherwise null',
      },
      { key: 'spouse_name', label: 'Spouse name', type: 'text' },
      {
        key: 'spouse_ssn',
        label: 'Spouse SSN',
        type: 'text',
        hint:
          'transcribe EXACTLY as printed; null if single / no spouse. Never invent missing digits.',
      },
      {
        key: 'spouse_dob',
        label: 'Spouse date of birth',
        type: 'date',
        hint: 'only if printed; otherwise null',
      },
      { key: 'address_street', label: 'Home address (street)', type: 'text' },
      { key: 'address_city', label: 'City', type: 'text' },
      {
        key: 'address_state',
        label: 'State',
        type: 'text',
        inputType: 'state',
        hint: '2-letter US state code',
      },
      { key: 'address_zip', label: 'ZIP code', type: 'text' },
      {
        key: 'phone',
        label: 'Phone',
        type: 'text',
        hint: 'only if printed on the return; otherwise null',
      },
      {
        key: 'dependents',
        label: 'Dependents (one entry per dependent)',
        type: 'group',
        repeating: true,
        fields: [
          { key: 'name', label: 'Dependent name', type: 'text' },
          {
            key: 'ssn',
            label: 'Dependent SSN',
            type: 'text',
            hint: 'exactly as printed; never invent digits',
          },
          {
            key: 'relationship',
            label: 'Relationship to taxpayer',
            type: 'text',
          },
          {
            key: 'dob',
            label: 'Date of birth',
            type: 'date',
            hint: 'null if not printed',
          },
        ],
      },
      {
        key: 'refund_routing_number',
        label: 'Refund direct deposit — routing number',
        type: 'text',
        hint: 'Form 1040 refund direct-deposit routing number if printed; else null',
      },
      {
        key: 'refund_account_number',
        label: 'Refund direct deposit — account number',
        type: 'text',
        hint: 'as printed (may be full or partial); else null',
      },
      {
        key: 'refund_account_type',
        label: 'Refund direct deposit — account type',
        type: 'text',
        hint: 'checking or savings if indicated; else null',
      },
      {
        key: 'agi',
        label: 'Adjusted gross income (summary)',
        type: 'number',
        hint: 'Form 1040 AGI line only, if clearly printed; else null. Do not compute.',
      },
    ],
  },
}

export function getFormSchema(formType: DocumentType): FormSchema | undefined {
  return FIELD_SCHEMAS[formType]
}

/** Form types that have a field schema and can be extracted end-to-end. */
export function getSupportedFormTypes(): DocumentType[] {
  return Object.keys(FIELD_SCHEMAS) as DocumentType[]
}

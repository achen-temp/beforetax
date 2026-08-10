import type { DocumentType } from '@/lib/tax/document-types'

/** Human-readable labels for every document/form type, for client- and CPA-facing UI. */
const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  w2: 'W-2 — Wage and Tax Statement',
  '1099_int': '1099-INT — Interest Income',
  '1099_div': '1099-DIV — Dividends and Distributions',
  '1099_b': '1099-B — Broker Proceeds',
  '1099_nec': '1099-NEC — Nonemployee Compensation',
  '1099_misc': '1099-MISC — Miscellaneous Income',
  '1099_r': '1099-R — Retirement Distributions',
  '1099_g': '1099-G — Certain Government Payments',
  '1099_k': '1099-K — Payment Card and Third Party Network Transactions',
  '1099_q': '1099-Q — Education Program Payments',
  '1099_sa': '1099-SA — HSA/MSA Distributions',
  '1098': '1098 — Mortgage Interest Statement',
  '1098_t': '1098-T — Tuition Statement',
  '1098_e': '1098-E — Student Loan Interest',
  '1095_a': '1095-A — Health Insurance Marketplace',
  '5498': '5498 — IRA Contributions',
  '5498_sa': '5498-SA — HSA/MSA Contributions',
  k1_1065: 'Schedule K-1 (Form 1065) — Partnership',
  k1_1120s: 'Schedule K-1 (Form 1120-S) — S-Corporation',
  k1_1041: 'Schedule K-1 (Form 1041) — Estate/Trust',
  ssa_1099: 'SSA-1099 — Social Security Benefits',
  other: 'Other document',
  unknown: 'Unrecognized document',
}

export function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type.toUpperCase()
}

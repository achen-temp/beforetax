// Canonical document/form types. Stored as text in the DB but validated here so
// new form types can be added without a migration. Keep values lowercase.

export const DOCUMENT_TYPES = [
  'w2',
  '1099_int',
  '1099_div',
  '1099_b',
  '1099_nec',
  '1099_misc',
  '1099_r',
  '1099_g',
  '1099_k',
  '1099_q',
  '1099_sa',
  '1098',
  '1098_t',
  '1098_e',
  '1095_a',
  '5498',
  '5498_sa',
  'k1_1065',
  'k1_1120s',
  'k1_1041',
  'ssa_1099',
  'other',
  'unknown',
] as const

export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value)
}

export const DOCUMENT_OWNERS = [
  'unknown',
  'taxpayer',
  'spouse',
  'joint',
  'dependent',
] as const

export type DocumentOwner = (typeof DOCUMENT_OWNERS)[number]

export type FieldDataType = 'number' | 'text' | 'date'

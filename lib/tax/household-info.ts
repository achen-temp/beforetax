import { z } from 'zod'

export const FILING_STATUSES = ['single', 'mfj', 'mfs', 'hoh', 'qw'] as const
export type FilingStatus = (typeof FILING_STATUSES)[number]

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: 'Single',
  mfj: 'Married filing jointly',
  mfs: 'Married filing separately',
  hoh: 'Head of household',
  qw: 'Qualifying surviving spouse',
}

export type HouseholdDependent = {
  name: string
  ssn: string
  relationship: string
  dob: string
}

export type HouseholdInfo = {
  filingStatus: FilingStatus | null
  taxpayerName: string
  taxpayerSsn: string
  taxpayerDob: string
  spouseName: string
  spouseSsn: string
  spouseDob: string
  addressStreet: string
  addressCity: string
  addressState: string
  addressZip: string
  phone: string
  dependents: HouseholdDependent[]
  refundRoutingNumber: string
  refundAccountNumber: string
  refundAccountType: string
  /** Document that last suggested a prefill (if any). */
  prefilledFromDocumentId: string | null
}

export function emptyHouseholdInfo(): HouseholdInfo {
  return {
    filingStatus: null,
    taxpayerName: '',
    taxpayerSsn: '',
    taxpayerDob: '',
    spouseName: '',
    spouseSsn: '',
    spouseDob: '',
    addressStreet: '',
    addressCity: '',
    addressState: '',
    addressZip: '',
    phone: '',
    dependents: [],
    refundRoutingNumber: '',
    refundAccountNumber: '',
    refundAccountType: '',
    prefilledFromDocumentId: null,
  }
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function normalizeFilingStatus(raw: string): FilingStatus | null {
  const t = raw.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if ((FILING_STATUSES as readonly string[]).includes(t)) return t as FilingStatus
  if (t.includes('joint')) return 'mfj'
  if (t.includes('separat')) return 'mfs'
  if (t.includes('head')) return 'hoh'
  if (t.includes('widow') || t.includes('surviving') || t === 'qw') return 'qw'
  if (t.includes('single')) return 'single'
  return null
}

export function parseHouseholdInfo(raw: unknown): HouseholdInfo {
  const base = emptyHouseholdInfo()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const obj = raw as Record<string, unknown>

  const filingRaw = asString(obj.filingStatus)
  base.filingStatus = filingRaw ? normalizeFilingStatus(filingRaw) : null
  base.taxpayerName = asString(obj.taxpayerName)
  base.taxpayerSsn = asString(obj.taxpayerSsn)
  base.taxpayerDob = asString(obj.taxpayerDob)
  base.spouseName = asString(obj.spouseName)
  base.spouseSsn = asString(obj.spouseSsn)
  base.spouseDob = asString(obj.spouseDob)
  base.addressStreet = asString(obj.addressStreet)
  base.addressCity = asString(obj.addressCity)
  base.addressState = asString(obj.addressState).toUpperCase().slice(0, 2)
  base.addressZip = asString(obj.addressZip)
  base.phone = asString(obj.phone)
  base.refundRoutingNumber = asString(obj.refundRoutingNumber)
  base.refundAccountNumber = asString(obj.refundAccountNumber)
  base.refundAccountType = asString(obj.refundAccountType)
  base.prefilledFromDocumentId =
    typeof obj.prefilledFromDocumentId === 'string' ? obj.prefilledFromDocumentId : null

  if (Array.isArray(obj.dependents)) {
    base.dependents = obj.dependents
      .map((d) => {
        if (!d || typeof d !== 'object' || Array.isArray(d)) return null
        const row = d as Record<string, unknown>
        const name = asString(row.name)
        if (!name) return null
        return {
          name,
          ssn: asString(row.ssn),
          relationship: asString(row.relationship),
          dob: asString(row.dob),
        }
      })
      .filter((d): d is HouseholdDependent => d !== null)
  }

  return base
}

/** True when the taxpayer hasn't saved meaningful household data yet. */
export function isHouseholdEmpty(info: HouseholdInfo): boolean {
  return (
    !info.filingStatus &&
    !info.taxpayerName &&
    !info.taxpayerSsn &&
    !info.spouseName &&
    !info.addressStreet &&
    info.dependents.length === 0 &&
    !info.refundRoutingNumber
  )
}

type ExtractedFieldBag = { value?: unknown; confidence?: number | null }

/** Map a prior_return ExtractionResult.fields blob into HouseholdInfo. */
export function householdFromPriorReturnFields(
  fields: Record<string, ExtractedFieldBag> | null | undefined,
  documentId: string
): HouseholdInfo {
  const info = emptyHouseholdInfo()
  if (!fields) return info

  const val = (key: string) => {
    const entry = fields[key]
    if (!entry || entry.value === null || entry.value === undefined) return ''
    return asString(entry.value)
  }

  info.filingStatus = normalizeFilingStatus(val('filing_status')) || null
  info.taxpayerName = val('taxpayer_name')
  info.taxpayerSsn = val('taxpayer_ssn')
  info.taxpayerDob = val('taxpayer_dob')
  info.spouseName = val('spouse_name')
  info.spouseSsn = val('spouse_ssn')
  info.spouseDob = val('spouse_dob')
  info.addressStreet = val('address_street')
  info.addressCity = val('address_city')
  info.addressState = val('address_state').toUpperCase().slice(0, 2)
  info.addressZip = val('address_zip')
  info.phone = val('phone')
  info.refundRoutingNumber = val('refund_routing_number')
  info.refundAccountNumber = val('refund_account_number')
  info.refundAccountType = val('refund_account_type')
  info.prefilledFromDocumentId = documentId

  const deps = fields.dependents?.value
  if (Array.isArray(deps)) {
    info.dependents = deps
      .map((d) => {
        if (!d || typeof d !== 'object' || Array.isArray(d)) return null
        const row = d as Record<string, unknown>
        const name = asString(row.name)
        if (!name) return null
        return {
          name,
          ssn: asString(row.ssn),
          relationship: asString(row.relationship),
          dob: asString(row.dob),
        }
      })
      .filter((d): d is HouseholdDependent => d !== null)
  }

  return info
}

const dependentSchema = z.object({
  name: z.string().trim().max(100),
  ssn: z.string().trim().max(20),
  relationship: z.string().trim().max(50),
  dob: z.string().trim().max(20),
})

export const HouseholdInfoInputSchema = z.object({
  filingStatus: z.enum(FILING_STATUSES).nullable(),
  taxpayerName: z.string().trim().max(100),
  taxpayerSsn: z.string().trim().max(20),
  taxpayerDob: z.string().trim().max(20),
  spouseName: z.string().trim().max(100),
  spouseSsn: z.string().trim().max(20),
  spouseDob: z.string().trim().max(20),
  addressStreet: z.string().trim().max(200),
  addressCity: z.string().trim().max(100),
  addressState: z.string().trim().max(2),
  addressZip: z.string().trim().max(20),
  phone: z.string().trim().max(30),
  dependents: z.array(dependentSchema).max(20),
  refundRoutingNumber: z.string().trim().max(20),
  refundAccountNumber: z.string().trim().max(30),
  refundAccountType: z.string().trim().max(20),
  prefilledFromDocumentId: z.string().uuid().nullable().optional(),
})

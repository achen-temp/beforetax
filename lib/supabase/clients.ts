import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateOtpCode,
  generatePortalToken,
  hashOtp,
  OTP_EXPIRY_MS,
} from '@/lib/auth/otp'
import { defaultTaxYear } from '@/lib/tax/default-tax-year'

export async function getClientByPortalToken(portalToken: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('id, firm_id, email, name, otp_expires_at')
    .eq('portal_token', portalToken)
    .single()

  if (error || !data) return null
  return data
}

export async function getClientById(clientId: string, firmId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('id, firm_id, email, name')
    .eq('id', clientId)
    .eq('firm_id', firmId)
    .single()

  if (error || !data) return null
  return data
}

export async function listClients(firmId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('id, email, name, phone, is_email_monitored, created_at, last_accessed_at')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data ?? []
}

export type ClientStatus = 'not_started' | 'needs_review' | 'in_progress' | 'complete'
export type ClientSort = 'priority' | 'recent' | 'name' | 'newest'

export interface ClientSummary {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  last_accessed_at: string | null
  /** When a CPA last emailed a portal OTP; null = never invited. */
  otp_sent_at: string | null
  portal_token: string | null
  tax_year: number | null
  doc_count: number
  processing_count: number
  review_count: number
  failed_count: number
  lowconf_count: number
  last_activity_at: string | null
  status: ClientStatus
}

export type ClientStatusCounts = { all: number } & Record<ClientStatus, number>

const CLIENT_SUMMARY_COLUMNS =
  'id, name, email, phone, created_at, last_accessed_at, otp_sent_at, portal_token, tax_year, doc_count, processing_count, review_count, failed_count, lowconf_count, last_activity_at, status'

/** Strip characters that would break a PostgREST `.or()` / ILIKE filter. */
function sanitizeSearch(search?: string | null): string | null {
  const cleaned = (search ?? '').replace(/[,%()*\\]/g, ' ').trim()
  return cleaned.length > 0 ? cleaned : null
}

export async function listClientSummaries(params: {
  firmId: string
  search?: string | null
  status?: ClientStatus | 'all'
  sort?: ClientSort
  page?: number
  limit?: number
}): Promise<{ clients: ClientSummary[]; total: number }> {
  const admin = createAdminClient()
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 25))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = admin
    .from('client_summaries')
    .select(CLIENT_SUMMARY_COLUMNS, { count: 'exact' })
    .eq('firm_id', params.firmId)

  const search = sanitizeSearch(params.search)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)

  if (params.status && params.status !== 'all') query = query.eq('status', params.status)

  switch (params.sort ?? 'priority') {
    case 'recent':
      query = query.order('last_activity_at', { ascending: false, nullsFirst: false })
      break
    case 'name':
      query = query.order('name', { ascending: true })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false })
      break
    default:
      query = query
        .order('status_rank', { ascending: true })
        .order('last_activity_at', { ascending: false, nullsFirst: false })
  }

  const { data, error, count } = await query.range(from, to)
  if (error) throw new Error(error.message)
  return { clients: (data as ClientSummary[]) ?? [], total: count ?? 0 }
}

export async function getClientStatusCounts(
  firmId: string,
  search?: string | null
): Promise<ClientStatusCounts> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('get_client_status_counts', {
    p_firm_id: firmId,
    p_search: sanitizeSearch(search),
  })
  if (error) throw new Error(error.message)

  const counts: ClientStatusCounts = {
    all: 0,
    not_started: 0,
    needs_review: 0,
    in_progress: 0,
    complete: 0,
  }
  for (const row of (data as { status: ClientStatus; count: number }[] | null) ?? []) {
    if (row.status in counts) {
      counts[row.status] = Number(row.count)
      counts.all += Number(row.count)
    }
  }
  return counts
}

export async function createClientWithOtp(
  firmId: string,
  input: { name: string; email: string; phone?: string }
) {
  const admin = createAdminClient()
  const otp = generateOtpCode()
  const portalToken = generatePortalToken()
  const hashed = await hashOtp(otp)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString()

  const { data: client, error } = await admin
    .from('clients')
    .insert({
      firm_id: firmId,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone ?? null,
      is_email_monitored: true,
      otp_token: hashed,
      otp_expires_at: expiresAt,
      portal_token: portalToken,
    })
    .select('id, email, name')
    .single()

  if (error || !client) throw new Error(error?.message ?? 'Failed to create client')

  const { error: taxYearError } = await admin.from('tax_years').insert({
    client_id: client.id,
    firm_id: firmId,
    year: defaultTaxYear(),
    status: 'collecting',
  })

  if (taxYearError) {
    await admin.from('clients').delete().eq('id', client.id)
    throw new Error(taxYearError.message)
  }

  return { client, otp, portalToken }
}

export async function refreshClientOtp(clientId: string, firmId: string) {
  const admin = createAdminClient()
  const otp = generateOtpCode()
  const portalToken = generatePortalToken()
  const hashed = await hashOtp(otp)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString()

  const { data, error } = await admin
    .from('clients')
    .update({
      otp_token: hashed,
      otp_expires_at: expiresAt,
      portal_token: portalToken,
    })
    .eq('id', clientId)
    .eq('firm_id', firmId)
    .select('id, email, name')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to refresh OTP')

  return { client: data, otp, portalToken }
}

/** Record that a CPA emailed a portal OTP (create-with-invite or resend). */
export async function markClientOtpSent(clientId: string, firmId: string): Promise<string> {
  const admin = createAdminClient()
  const sentAt = new Date().toISOString()
  const { data, error } = await admin
    .from('clients')
    .update({ otp_sent_at: sentAt })
    .eq('id', clientId)
    .eq('firm_id', firmId)
    .select('otp_sent_at')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to mark OTP sent')
  return data.otp_sent_at as string
}

/** Regenerate OTP but keep the same portal link (for in-page resend). */
export async function regenerateOtpForPortal(clientId: string, portalToken: string) {
  const admin = createAdminClient()
  const otp = generateOtpCode()
  const hashed = await hashOtp(otp)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString()

  const { data, error } = await admin
    .from('clients')
    .update({
      otp_token: hashed,
      otp_expires_at: expiresAt,
    })
    .eq('id', clientId)
    .eq('portal_token', portalToken)
    .select('id, email, name, firm_id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Failed to refresh OTP')

  return { client: data, otp }
}

/**
 * Email-based portal login: find client(s) by email, issue a fresh OTP, ensure
 * portal_token exists. Same email can exist at multiple firms — pick the most
 * recently accessed (then newest). Returns null when no match (caller should
 * not reveal that to the user).
 */
export async function startPortalLoginByEmail(email: string) {
  const admin = createAdminClient()
  const normalized = email.toLowerCase().trim()

  const { data: matches, error } = await admin
    .from('clients')
    .select('id, firm_id, email, name, portal_token, last_accessed_at, created_at')
    .eq('email', normalized)

  if (error) throw new Error(error.message)
  if (!matches?.length) return null

  const client = [...matches].sort((a, b) => {
    const aAccess = a.last_accessed_at ? Date.parse(a.last_accessed_at) : 0
    const bAccess = b.last_accessed_at ? Date.parse(b.last_accessed_at) : 0
    if (bAccess !== aAccess) return bAccess - aAccess
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })[0]!

  const otp = generateOtpCode()
  const hashed = await hashOtp(otp)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString()
  const portalToken = client.portal_token ?? generatePortalToken()
  const sentAt = new Date().toISOString()

  const { data, error: updateError } = await admin
    .from('clients')
    .update({
      otp_token: hashed,
      otp_expires_at: expiresAt,
      portal_token: portalToken,
      otp_sent_at: sentAt,
    })
    .eq('id', client.id)
    .select('id, email, name, firm_id')
    .single()

  if (updateError || !data) {
    throw new Error(updateError?.message ?? 'Failed to start portal login')
  }

  return { client: data, otp, portalToken }
}

export async function getClientOtpCredentials(clientId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clients')
    .select('otp_token, otp_expires_at')
    .eq('id', clientId)
    .single()

  if (error || !data) return null
  return data
}

export async function clearClientOtp(clientId: string) {
  const admin = createAdminClient()
  await admin
    .from('clients')
    .update({
      otp_token: null,
      last_accessed_at: new Date().toISOString(),
    })
    .eq('id', clientId)
}

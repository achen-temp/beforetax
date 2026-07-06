import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateOtpCode,
  generatePortalToken,
  hashOtp,
  OTP_EXPIRY_MS,
} from '@/lib/auth/otp'

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

  const currentYear = new Date().getFullYear()
  const { error: taxYearError } = await admin.from('tax_years').insert({
    client_id: client.id,
    firm_id: firmId,
    year: currentYear,
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

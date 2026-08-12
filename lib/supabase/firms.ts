import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CpaFirmBranding, CpaUserRole } from '@/types'

export async function getFirmForUser(userId: string) {
  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from('cpa_users')
    .select('firm_id, role')
    .eq('id', userId)
    .single()

  if (profileError || !profile) return null

  const { data: firm, error: firmError } = await supabase
    .from('cpa_firms')
    .select('name, email, branding')
    .eq('id', profile.firm_id)
    .single()

  const role = profile.role as CpaUserRole

  if (firmError) {
    return {
      firmId: profile.firm_id,
      firmName: null,
      firmEmail: null,
      logoUrl: null,
      role,
    }
  }

  const branding = parseBranding(firm?.branding)
  return {
    firmId: profile.firm_id,
    firmName: firm?.name ?? null,
    firmEmail: firm?.email?.trim() || null,
    logoUrl: branding.logoUrl ?? null,
    role,
  }
}

export type FirmPortalBrand = {
  firmName: string | null
  logoUrl: string | null
  /** Where taxpayers should email tax documents (cpa_firms.email; defaults to owner signup email). */
  documentIntakeEmail: string | null
}

function parseBranding(raw: unknown): CpaFirmBranding {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const obj = raw as Record<string, unknown>
  const logoUrl = typeof obj.logoUrl === 'string' ? obj.logoUrl : undefined
  const primaryColor = typeof obj.primaryColor === 'string' ? obj.primaryColor : undefined
  return { logoUrl, primaryColor }
}

/** Resolve firm display name for portal / email branding. */
export async function getFirmNameById(firmId: string): Promise<string | null> {
  const brand = await getFirmPortalBrand(firmId)
  return brand.firmName
}

/** Name + logo + intake email for client portal chrome. */
export async function getFirmPortalBrand(firmId: string): Promise<FirmPortalBrand> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cpa_firms')
    .select('name, email, branding')
    .eq('id', firmId)
    .maybeSingle()

  if (error || !data) {
    return { firmName: null, logoUrl: null, documentIntakeEmail: null }
  }
  const branding = parseBranding(data.branding)
  return {
    firmName: data.name?.trim() || null,
    logoUrl: branding.logoUrl?.trim() || null,
    documentIntakeEmail: data.email?.trim().toLowerCase() || null,
  }
}

/** Owner updates the public firm name shown in the CPA shell and client portal. */
export async function updateFirmName(firmId: string, name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Firm name is required.')
  if (trimmed.length > 100) throw new Error('Firm name is too long.')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cpa_firms')
    .update({ name: trimmed })
    .eq('id', firmId)
    .select('name')
    .maybeSingle()

  if (error) throw new Error('Unable to update firm name.')
  if (!data) throw new Error('Firm not found.')
  return data.name
}

const firmEmailSchema = z.string().trim().email('Please enter a valid email address').max(254)

/** Owner updates the firm email taxpayers use to send tax documents. */
export async function updateFirmDocumentIntakeEmail(
  firmId: string,
  email: string
): Promise<string> {
  const parsed = firmEmailSchema.safeParse(email)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid email address.')
  }
  const normalized = parsed.data.toLowerCase()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cpa_firms')
    .update({ email: normalized })
    .eq('id', firmId)
    .select('email')
    .maybeSingle()

  if (error) throw new Error('Unable to update document intake email.')
  if (!data) throw new Error('Firm not found.')
  return data.email
}

const LOGO_MAX_BYTES = 1024 * 1024
const LOGO_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * Upload a firm logo to Storage and store the public URL in cpa_firms.branding.
 * Bytes live in Storage (not the DB); only the URL is persisted on the firm row.
 */
export async function uploadFirmLogo(
  firmId: string,
  file: File
): Promise<{ logoUrl: string }> {
  const mime = file.type
  const ext = LOGO_MIME[mime]
  if (!ext) throw new Error('Logo must be a PNG, JPEG, or WebP image.')
  if (file.size > LOGO_MAX_BYTES) throw new Error('Logo must be 1MB or smaller.')

  const admin = createAdminClient()
  const path = `${firmId}/logo.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  // Replace any previous logo extension for this firm.
  const { data: existing } = await admin.storage.from('firm-branding').list(firmId)
  if (existing?.length) {
    await admin.storage
      .from('firm-branding')
      .remove(existing.map((f) => `${firmId}/${f.name}`))
  }

  const { error: uploadError } = await admin.storage.from('firm-branding').upload(path, buffer, {
    contentType: mime,
    upsert: true,
  })
  if (uploadError) {
    if (/bucket|not found|does not exist/i.test(uploadError.message)) {
      throw new Error(
        'Logo storage isn’t set up yet. Run migration 017_firm_branding_bucket.sql in Supabase.'
      )
    }
    throw new Error('Unable to upload logo. Please try again.')
  }

  const { data: pub } = admin.storage.from('firm-branding').getPublicUrl(path)
  // Cache-bust so the new logo shows immediately after replace.
  const logoUrl = `${pub.publicUrl}?v=${Date.now()}`

  const { data: firm, error: firmError } = await admin
    .from('cpa_firms')
    .select('branding')
    .eq('id', firmId)
    .maybeSingle()
  if (firmError || !firm) throw new Error('Firm not found.')

  const nextBranding: CpaFirmBranding = {
    ...parseBranding(firm.branding),
    logoUrl,
  }

  const { error: updateError } = await admin
    .from('cpa_firms')
    .update({ branding: nextBranding })
    .eq('id', firmId)
  if (updateError) throw new Error('Unable to save logo URL.')

  return { logoUrl }
}

export async function removeFirmLogo(firmId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: existing } = await admin.storage.from('firm-branding').list(firmId)
  if (existing?.length) {
    await admin.storage
      .from('firm-branding')
      .remove(existing.map((f) => `${firmId}/${f.name}`))
  }

  const { data: firm, error: firmError } = await admin
    .from('cpa_firms')
    .select('branding')
    .eq('id', firmId)
    .maybeSingle()
  if (firmError || !firm) throw new Error('Firm not found.')

  const current = parseBranding(firm.branding)
  const { logoUrl: _removed, ...rest } = current
  const { error: updateError } = await admin
    .from('cpa_firms')
    .update({ branding: rest })
    .eq('id', firmId)
  if (updateError) throw new Error('Unable to remove logo.')
}

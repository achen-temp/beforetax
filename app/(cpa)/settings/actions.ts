'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOwnerProfile } from '@/lib/supabase/cpa-users'
import {
  removeFirmLogo,
  updateFirmDocumentIntakeEmail,
  updateFirmName,
  uploadFirmLogo,
} from '@/lib/supabase/firms'
import {
  saveFirmIntakeTemplate,
  updateFirmSettings,
  type FirmSettings,
} from '@/lib/supabase/firm-settings'
import type { IntakeTemplateItem } from '@/lib/tax/intake-checklist'

export type SaveFirmSettingsResult =
  | { ok: true; settings: FirmSettings }
  | { ok: false; error: string }

export type SaveFirmProfileResult =
  | { ok: true; firmName: string; documentIntakeEmail: string }
  | { ok: false; error: string }

export type FirmLogoResult =
  | { ok: true; logoUrl: string | null }
  | { ok: false; error: string }

/**
 * Persist a partial firm-settings update for the signed-in CPA's firm. Resolves
 * the firm from the authenticated session (never trusts a firm id from the
 * client) so a user can only change their own firm's settings. Owner-only.
 */
export async function saveFirmSettings(
  patch: Partial<FirmSettings>
): Promise<SaveFirmSettingsResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }

    let owner
    try {
      owner = await requireOwnerProfile(user.id)
    } catch {
      return { ok: false, error: 'Only the firm owner can change settings.' }
    }

    const settings = await updateFirmSettings(owner.firmId, patch)
    revalidatePath('/settings', 'layout')
    return { ok: true, settings }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t save settings'
    if (/settings/i.test(message) && /column|schema/i.test(message)) {
      return {
        ok: false,
        error: 'Settings aren’t set up yet. Run migration 008_firm_settings.sql in Supabase.',
      }
    }
    return { ok: false, error: message }
  }
}

export type SaveIntakeTemplateResult =
  | { ok: true; template: IntakeTemplateItem[] | null }
  | { ok: false; error: string }

/** Owner saves the firm default intake checklist template (`null` = platform default). */
export async function saveIntakeChecklistTemplate(
  template: IntakeTemplateItem[] | null
): Promise<SaveIntakeTemplateResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }

    let owner
    try {
      owner = await requireOwnerProfile(user.id)
    } catch {
      return { ok: false, error: 'Only the firm owner can change settings.' }
    }

    const settings = await saveFirmIntakeTemplate(owner.firmId, template)
    revalidatePath('/settings', 'layout')
    return { ok: true, template: settings.intakeChecklistTemplate }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t save checklist template'
    return { ok: false, error: message }
  }
}

/** Update firm profile (name + tax-document intake email). Owner-only. */
export async function saveFirmProfile(input: {
  firmName: string
  documentIntakeEmail: string
}): Promise<SaveFirmProfileResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }

    let owner
    try {
      owner = await requireOwnerProfile(user.id)
    } catch {
      return { ok: false, error: 'Only the firm owner can change firm profile.' }
    }

    const firmName = await updateFirmName(owner.firmId, input.firmName)
    const documentIntakeEmail = await updateFirmDocumentIntakeEmail(
      owner.firmId,
      input.documentIntakeEmail
    )
    revalidatePath('/settings', 'layout')
    revalidatePath('/account')
    revalidatePath('/clients')
    revalidatePath('/portal/upload')
    return { ok: true, firmName, documentIntakeEmail }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t save firm profile'
    return { ok: false, error: message }
  }
}

export async function saveFirmLogo(formData: FormData): Promise<FirmLogoResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }

    let owner
    try {
      owner = await requireOwnerProfile(user.id)
    } catch {
      return { ok: false, error: 'Only the firm owner can change the logo.' }
    }

    const file = formData.get('logo')
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a logo image to upload.' }
    }

    const { logoUrl } = await uploadFirmLogo(owner.firmId, file)
    revalidatePath('/settings', 'layout')
    revalidatePath('/clients')
    return { ok: true, logoUrl }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t upload logo'
    return { ok: false, error: message }
  }
}

export async function clearFirmLogo(): Promise<FirmLogoResult> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }

    let owner
    try {
      owner = await requireOwnerProfile(user.id)
    } catch {
      return { ok: false, error: 'Only the firm owner can change the logo.' }
    }

    await removeFirmLogo(owner.firmId)
    revalidatePath('/settings', 'layout')
    revalidatePath('/clients')
    return { ok: true, logoUrl: null }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t remove logo'
    return { ok: false, error: message }
  }
}

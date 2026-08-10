'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import { updateFirmSettings, type FirmSettings } from '@/lib/supabase/firm-settings'

export type SaveFirmSettingsResult =
  | { ok: true; settings: FirmSettings }
  | { ok: false; error: string }

/**
 * Persist a partial firm-settings update for the signed-in CPA's firm. Resolves
 * the firm from the authenticated session (never trusts a firm id from the
 * client) so a user can only change their own firm's settings.
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

    const firm = await getFirmForUser(user.id)
    if (!firm) return { ok: false, error: 'Firm not found.' }

    const settings = await updateFirmSettings(firm.firmId, patch)
    revalidatePath('/settings')
    return { ok: true, settings }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t save settings'
    // Missing migration shows up as a Postgres "column does not exist" error.
    if (/settings/i.test(message) && /column|schema/i.test(message)) {
      return {
        ok: false,
        error: 'Settings aren’t set up yet. Run migration 008_firm_settings.sql in Supabase.',
      }
    }
    return { ok: false, error: message }
  }
}

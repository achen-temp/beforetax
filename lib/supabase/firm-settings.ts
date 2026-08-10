import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Firm-level configuration. Persisted as a single JSONB blob on cpa_firms and
 * always merged with DEFAULT_FIRM_SETTINGS on read, so:
 *   - a firm with no row/empty object gets all defaults, and
 *   - adding a new key here doesn't require a migration or backfill.
 */
export interface FirmSettings {
  /** Reject a re-upload of identical file content within a tax year (content
   * dedup). When false, duplicates are allowed and their file_hash is stored as
   * NULL so the unique index doesn't block them. */
  skipDuplicateUploads: boolean
}

export const DEFAULT_FIRM_SETTINGS: FirmSettings = {
  skipDuplicateUploads: true,
}

/** Coerce a raw JSONB blob into FirmSettings. Explicit `false` must win over the
 * default `true` — never use `||` / `??` on the boolean itself. */
function mergeSettings(raw: unknown): FirmSettings {
  const partial =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}
  return {
    skipDuplicateUploads:
      typeof partial.skipDuplicateUploads === 'boolean'
        ? partial.skipDuplicateUploads
        : DEFAULT_FIRM_SETTINGS.skipDuplicateUploads,
  }
}

/** Read a firm's settings merged over the defaults. Never throws for a missing
 * firm — returns defaults so callers (e.g. the upload path) stay resilient. */
export async function getFirmSettings(firmId: string): Promise<FirmSettings> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cpa_firms')
    .select('settings')
    .eq('id', firmId)
    .maybeSingle()

  if (error || !data) return { ...DEFAULT_FIRM_SETTINGS }
  return mergeSettings(data.settings)
}

/** Merge a patch into the firm's settings and persist the full object. Returns the
 * resulting settings. */
export async function updateFirmSettings(
  firmId: string,
  patch: Partial<FirmSettings>
): Promise<FirmSettings> {
  const current = await getFirmSettings(firmId)
  const next = mergeSettings({ ...current, ...patch })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cpa_firms')
    .update({ settings: next })
    .eq('id', firmId)
    .select('settings')
    .maybeSingle()

  if (error) throw new Error(`Failed to update firm settings: ${error.message}`)
  if (!data) throw new Error('Firm not found')

  return mergeSettings(data.settings)
}

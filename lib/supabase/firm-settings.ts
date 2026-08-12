import { createAdminClient } from '@/lib/supabase/admin'
import {
  DEFAULT_INTAKE_TEMPLATE,
  parseIntakeTemplate,
  resolveIntakeTemplate,
  type IntakeTemplateItem,
} from '@/lib/tax/intake-checklist'

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
  /**
   * Default intake checklist applied to client tax years.
   * `null` = use platform default template.
   */
  intakeChecklistTemplate: IntakeTemplateItem[] | null
}

export const DEFAULT_FIRM_SETTINGS: FirmSettings = {
  skipDuplicateUploads: true,
  intakeChecklistTemplate: null,
}

/** Coerce a raw JSONB blob into FirmSettings. Explicit `false` must win over the
 * default `true` — never use `||` / `??` on the boolean itself. */
function mergeSettings(raw: unknown): FirmSettings {
  const partial =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  let intakeChecklistTemplate: IntakeTemplateItem[] | null =
    DEFAULT_FIRM_SETTINGS.intakeChecklistTemplate
  if ('intakeChecklistTemplate' in partial) {
    if (partial.intakeChecklistTemplate === null) {
      intakeChecklistTemplate = null
    } else if (Array.isArray(partial.intakeChecklistTemplate)) {
      const parsed = parseIntakeTemplate(partial.intakeChecklistTemplate)
      intakeChecklistTemplate = parsed.length > 0 ? parsed : null
    }
  }

  return {
    skipDuplicateUploads:
      typeof partial.skipDuplicateUploads === 'boolean'
        ? partial.skipDuplicateUploads
        : DEFAULT_FIRM_SETTINGS.skipDuplicateUploads,
    intakeChecklistTemplate,
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

/** Effective intake template for “Apply checklist” on a client year. */
export async function getFirmIntakeTemplate(
  firmId: string
): Promise<IntakeTemplateItem[]> {
  const settings = await getFirmSettings(firmId)
  return resolveIntakeTemplate(settings.intakeChecklistTemplate)
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

/** Convenience: persist a custom template, or null to revert to platform default. */
export async function saveFirmIntakeTemplate(
  firmId: string,
  template: IntakeTemplateItem[] | null
): Promise<FirmSettings> {
  if (template === null) {
    return updateFirmSettings(firmId, { intakeChecklistTemplate: null })
  }
  const parsed = parseIntakeTemplate(template)
  return updateFirmSettings(firmId, {
    intakeChecklistTemplate: parsed.length > 0 ? parsed : null,
  })
}

export { DEFAULT_INTAKE_TEMPLATE }

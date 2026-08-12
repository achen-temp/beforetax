import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTaxYear } from '@/lib/supabase/tax-years'
import { getFirmIntakeTemplate } from '@/lib/supabase/firm-settings'
import {
  createIntakeFromTemplate,
  parseIntakeChecklist,
  type IntakeChecklistItem,
} from '@/lib/tax/intake-checklist'

export async function getIntakeChecklist(params: {
  clientId: string
  firmId: string
  year: number
}): Promise<{ taxYearId: string; year: number; items: IntakeChecklistItem[] }> {
  const taxYear = await ensureTaxYear(params)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tax_years')
    .select('id, year, intake_checklist')
    .eq('id', taxYear.id)
    .eq('firm_id', params.firmId)
    .maybeSingle()

  if (error) {
    if (/intake_checklist|column|schema cache/i.test(error.message)) {
      throw new Error(
        'Intake checklist isn’t set up yet. Run migration 018_intake_checklist.sql in Supabase.'
      )
    }
    throw new Error('Unable to load intake checklist.')
  }
  if (!data) throw new Error('Tax year not found.')

  return {
    taxYearId: data.id,
    year: data.year,
    items: parseIntakeChecklist(data.intake_checklist),
  }
}

export async function saveIntakeChecklist(params: {
  clientId: string
  firmId: string
  year: number
  items: IntakeChecklistItem[]
}): Promise<IntakeChecklistItem[]> {
  const taxYear = await ensureTaxYear({
    clientId: params.clientId,
    firmId: params.firmId,
    year: params.year,
  })
  const normalized = parseIntakeChecklist(params.items)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('tax_years')
    .update({ intake_checklist: normalized })
    .eq('id', taxYear.id)
    .eq('firm_id', params.firmId)
    .select('intake_checklist')
    .maybeSingle()

  if (error) {
    if (/intake_checklist|column|schema cache/i.test(error.message)) {
      throw new Error(
        'Intake checklist isn’t set up yet. Run migration 018_intake_checklist.sql in Supabase.'
      )
    }
    throw new Error('Unable to save intake checklist.')
  }
  if (!data) throw new Error('Tax year not found.')
  return parseIntakeChecklist(data.intake_checklist)
}

/** Apply this firm's intake template (or platform default) to the tax year. */
export async function applyDefaultIntakeChecklist(params: {
  clientId: string
  firmId: string
  year: number
}): Promise<IntakeChecklistItem[]> {
  const template = await getFirmIntakeTemplate(params.firmId)
  return saveIntakeChecklist({
    ...params,
    items: createIntakeFromTemplate(template),
  })
}

'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getFirmForUser } from '@/lib/supabase/firms'
import {
  applyDefaultIntakeChecklist,
  getIntakeChecklist,
  saveIntakeChecklist,
} from '@/lib/supabase/intake-checklist'
import {
  parseIntakeChecklist,
  type IntakeChecklistItem,
  type IntakeItemStatus,
} from '@/lib/tax/intake-checklist'

export type IntakeActionResult =
  | { ok: true; items: IntakeChecklistItem[] }
  | { ok: false; error: string }

type FirmAccess =
  | { ok: true; firmId: string; clientId: string }
  | { ok: false; error: string }

async function requireFirmAccess(clientId: string): Promise<FirmAccess> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in again.' }

  const firm = await getFirmForUser(user.id)
  if (!firm) return { ok: false, error: 'Please sign in again.' }

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('firm_id', firm.firmId)
    .maybeSingle()

  if (!client) return { ok: false, error: 'Client not found.' }
  return { ok: true, firmId: firm.firmId, clientId }
}

function revalidate(clientId: string) {
  revalidatePath(`/clients/${clientId}`)
  revalidatePath(`/clients/${clientId}/checklist`)
}

export async function applyIntakeTemplateAction(input: {
  clientId: string
  year: number
}): Promise<IntakeActionResult> {
  try {
    const access = await requireFirmAccess(input.clientId)
    if (!access.ok) return { ok: false, error: access.error }

    const items = await applyDefaultIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
    })
    revalidate(access.clientId)
    return { ok: true, items }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Couldn’t apply checklist.',
    }
  }
}

export async function setIntakeItemStatusAction(input: {
  clientId: string
  year: number
  itemId: string
  status: IntakeItemStatus
}): Promise<IntakeActionResult> {
  try {
    const access = await requireFirmAccess(input.clientId)
    if (!access.ok) return { ok: false, error: access.error }

    const current = await getIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
    })
    const next = current.items.map((item) =>
      item.id === input.itemId ? { ...item, status: input.status } : item
    )
    const items = await saveIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
      items: next,
    })
    revalidate(access.clientId)
    return { ok: true, items }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Couldn’t update item.',
    }
  }
}

export async function removeIntakeItemAction(input: {
  clientId: string
  year: number
  itemId: string
}): Promise<IntakeActionResult> {
  try {
    const access = await requireFirmAccess(input.clientId)
    if (!access.ok) return { ok: false, error: access.error }

    const current = await getIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
    })
    const items = await saveIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
      items: current.items.filter((i) => i.id !== input.itemId),
    })
    revalidate(access.clientId)
    return { ok: true, items }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Couldn’t remove item.',
    }
  }
}

export async function addIntakeItemAction(input: {
  clientId: string
  year: number
  categoryId: import('@/lib/tax/intake-checklist').IntakeCategoryId
  label: string
}): Promise<IntakeActionResult> {
  try {
    const access = await requireFirmAccess(input.clientId)
    if (!access.ok) return { ok: false, error: access.error }

    const label = input.label.trim()
    if (!label) return { ok: false, error: 'Item label is required.' }
    if (label.length > 200) return { ok: false, error: 'Item label is too long.' }

    const { newIntakeItemId } = await import('@/lib/tax/intake-checklist')
    const current = await getIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
    })
    const items = await saveIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
      items: [
        ...current.items,
        {
          id: newIntakeItemId(),
          categoryId: input.categoryId,
          label,
          status: 'needed',
        },
      ],
    })
    revalidate(access.clientId)
    return { ok: true, items }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Couldn’t add item.',
    }
  }
}

export async function replaceIntakeChecklistAction(input: {
  clientId: string
  year: number
  items: IntakeChecklistItem[]
}): Promise<IntakeActionResult> {
  try {
    const access = await requireFirmAccess(input.clientId)
    if (!access.ok) return { ok: false, error: access.error }

    const items = await saveIntakeChecklist({
      clientId: access.clientId,
      firmId: access.firmId,
      year: input.year,
      items: parseIntakeChecklist(input.items),
    })
    revalidate(access.clientId)
    return { ok: true, items }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Couldn’t save checklist.',
    }
  }
}

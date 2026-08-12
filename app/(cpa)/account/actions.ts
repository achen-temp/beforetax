'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { updateCpaNames } from '@/lib/supabase/cpa-users'
import { namePartSchema } from '@/lib/validations/auth'
import { z } from 'zod'

const ProfileNameSchema = z.object({
  firstName: namePartSchema,
  lastName: namePartSchema,
})

export type SaveAccountProfileResult =
  | { ok: true; firstName: string; lastName: string }
  | { ok: false; error: string }

/** Update the signed-in CPA's own first/last name. */
export async function saveAccountProfile(input: {
  firstName: string
  lastName: string
}): Promise<SaveAccountProfileResult> {
  try {
    const parsed = ProfileNameSchema.safeParse(input)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid name.',
      }
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }

    const names = await updateCpaNames(user.id, parsed.data)
    revalidatePath('/account')
    revalidatePath('/team')
    revalidatePath('/clients')
    return { ok: true, ...names }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Couldn’t save profile'
    return { ok: false, error: message }
  }
}

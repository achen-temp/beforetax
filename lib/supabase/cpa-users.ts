import { createClient } from '@/lib/supabase/server'
import type { CpaUserRole } from '@/types'

export type CpaProfile = {
  userId: string
  firmId: string
  email: string
  role: CpaUserRole
  firstName: string | null
  lastName: string | null
}

/** Load the signed-in CPA's firm membership. Returns null if not a CPA user. */
export async function getCpaProfile(userId: string): Promise<CpaProfile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cpa_users')
    .select('id, firm_id, email, role, first_name, last_name')
    .eq('id', userId)
    .single()

  if (!error && data) {
    return {
      userId: data.id,
      firmId: data.firm_id,
      email: data.email,
      role: data.role,
      firstName: data.first_name,
      lastName: data.last_name,
    }
  }

  // Migration 016 not applied — fall back without names.
  if (error && /first_name|last_name|column|schema cache/i.test(error.message)) {
    const { data: legacy, error: legacyError } = await supabase
      .from('cpa_users')
      .select('id, firm_id, email, role')
      .eq('id', userId)
      .single()
    if (legacyError || !legacy) return null
    return {
      userId: legacy.id,
      firmId: legacy.firm_id,
      email: legacy.email,
      role: legacy.role,
      firstName: null,
      lastName: null,
    }
  }

  return null
}

export async function requireCpaProfile(userId: string): Promise<CpaProfile> {
  const profile = await getCpaProfile(userId)
  if (!profile) throw new Error('Unauthorized')
  return profile
}

export async function requireOwnerProfile(userId: string): Promise<CpaProfile> {
  const profile = await requireCpaProfile(userId)
  if (profile.role !== 'owner') {
    throw new Error('Only the firm owner can do that.')
  }
  return profile
}

export type FirmMember = {
  id: string
  email: string
  role: CpaUserRole
  first_name: string | null
  last_name: string | null
  created_at: string
}

export async function listFirmMembers(firmId: string): Promise<FirmMember[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cpa_users')
    .select('id, email, role, first_name, last_name, created_at')
    .eq('firm_id', firmId)
    .order('created_at', { ascending: true })

  if (error) {
    // Migration 016 not applied yet — fall back without names.
    if (/first_name|last_name|column|schema cache/i.test(error.message)) {
      const { data: legacy, error: legacyError } = await supabase
        .from('cpa_users')
        .select('id, email, role, created_at')
        .eq('firm_id', firmId)
        .order('created_at', { ascending: true })
      if (legacyError) throw new Error('Unable to load team members')
      return (legacy ?? []).map((row) => ({
        ...row,
        first_name: null,
        last_name: null,
      }))
    }
    throw new Error('Unable to load team members')
  }
  return data ?? []
}

/** Update the signed-in CPA's first/last name on their own row. */
export async function updateCpaNames(
  userId: string,
  input: { firstName: string; lastName: string }
): Promise<{ firstName: string; lastName: string }> {
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!firstName || !lastName) {
    throw new Error('First and last name are required.')
  }
  if (firstName.length > 50 || lastName.length > 50) {
    throw new Error('Name is too long.')
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cpa_users')
    .update({ first_name: firstName, last_name: lastName })
    .eq('id', userId)
    .select('first_name, last_name')
    .maybeSingle()

  if (error) {
    if (/first_name|last_name|column|schema cache/i.test(error.message)) {
      throw new Error(
        'Name fields aren’t set up yet. Run migration 016_cpa_user_names.sql in Supabase.'
      )
    }
    throw new Error('Unable to update your name.')
  }
  if (!data) throw new Error('Profile not found.')

  return {
    firstName: data.first_name ?? firstName,
    lastName: data.last_name ?? lastName,
  }
}


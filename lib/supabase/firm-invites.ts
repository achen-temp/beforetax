import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { CpaUserRole } from '@/types'

export const FIRM_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export type FirmInvite = {
  id: string
  firm_id: string
  email: string
  role: CpaUserRole
  token: string
  invited_by: string
  expires_at: string
  accepted_at: string | null
  created_at: string
}

export type PendingInvite = {
  id: string
  email: string
  role: CpaUserRole
  expires_at: string
  created_at: string
}

export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export async function listPendingInvites(firmId: string): Promise<PendingInvite[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('firm_invites')
    .select('id, email, role, expires_at, created_at')
    .eq('firm_id', firmId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    // Migration not applied yet — treat as empty rather than crashing Settings.
    if (/firm_invites|schema cache|does not exist/i.test(error.message)) {
      return []
    }
    throw new Error('Unable to load invites')
  }

  return data ?? []
}

export async function getInviteByToken(token: string): Promise<{
  id: string
  firm_id: string
  email: string
  role: CpaUserRole
  expires_at: string
  accepted_at: string | null
  firm_name: string | null
} | null> {
  const admin = createAdminClient()
  const { data: invite, error } = await admin
    .from('firm_invites')
    .select('id, firm_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle()

  if (error || !invite) return null

  const { data: firm } = await admin
    .from('cpa_firms')
    .select('name')
    .eq('id', invite.firm_id)
    .maybeSingle()

  return {
    ...invite,
    firm_name: firm?.name ?? null,
  }
}

export async function createFirmInvite(input: {
  firmId: string
  email: string
  role: Exclude<CpaUserRole, 'owner'>
  invitedBy: string
}): Promise<{ invite: FirmInvite; token: string }> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()
  const token = generateInviteToken()
  const expiresAt = new Date(Date.now() + FIRM_INVITE_EXPIRY_MS).toISOString()

  // Block if already a member of this firm
  const { data: existingMember } = await admin
    .from('cpa_users')
    .select('id')
    .eq('firm_id', input.firmId)
    .ilike('email', email)
    .maybeSingle()

  if (existingMember) {
    throw new Error('That email is already on your team.')
  }

  // Block if they already belong to any firm (can't join a second one)
  const { data: anyMembership } = await admin
    .from('cpa_users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (anyMembership) {
    throw new Error('That email already belongs to another firm.')
  }

  // Replace any pending invite for the same email
  await admin
    .from('firm_invites')
    .delete()
    .eq('firm_id', input.firmId)
    .ilike('email', email)
    .is('accepted_at', null)

  const { data, error } = await admin
    .from('firm_invites')
    .insert({
      firm_id: input.firmId,
      email,
      role: input.role,
      token,
      invited_by: input.invitedBy,
      expires_at: expiresAt,
    })
    .select('id, firm_id, email, role, token, invited_by, expires_at, accepted_at, created_at')
    .single()

  if (error || !data) {
    if (/firm_invites|schema cache|does not exist/i.test(error?.message ?? '')) {
      throw new Error(
        'Team invites aren’t set up yet. Run migration 015_firm_invites.sql in Supabase.'
      )
    }
    throw new Error('Unable to create invite. Please try again.')
  }

  return { invite: data, token }
}

export async function revokeFirmInvite(firmId: string, inviteId: string): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('firm_invites')
    .delete()
    .eq('id', inviteId)
    .eq('firm_id', firmId)
    .is('accepted_at', null)

  if (error) throw new Error('Unable to revoke invite.')
}

export async function removeFirmMember(input: {
  firmId: string
  memberId: string
  actorId: string
}): Promise<void> {
  const admin = createAdminClient()

  if (input.memberId === input.actorId) {
    throw new Error('You can’t remove yourself.')
  }

  const { data: member, error: memberError } = await admin
    .from('cpa_users')
    .select('id, role, firm_id')
    .eq('id', input.memberId)
    .eq('firm_id', input.firmId)
    .maybeSingle()

  if (memberError || !member) {
    throw new Error('Team member not found.')
  }

  if (member.role === 'owner') {
    throw new Error('You can’t remove the firm owner.')
  }

  const { error: deleteError } = await admin
    .from('cpa_users')
    .delete()
    .eq('id', input.memberId)
    .eq('firm_id', input.firmId)

  if (deleteError) throw new Error('Unable to remove team member.')

  // Also remove their auth user so the email can be re-invited cleanly
  try {
    await admin.auth.admin.deleteUser(input.memberId)
  } catch (e) {
    console.error('Failed to delete auth user after member removal:', e)
  }
}

export async function acceptFirmInvite(input: {
  token: string
  userId: string
  email: string
  firstName: string
  lastName: string
}): Promise<string> {
  const admin = createAdminClient()
  const { data: firmId, error } = await admin.rpc('accept_firm_invite', {
    p_token: input.token,
    p_user_id: input.userId,
    p_email: input.email.trim().toLowerCase(),
    p_first_name: input.firstName,
    p_last_name: input.lastName,
  })

  if (error || !firmId) {
    const msg = error?.message ?? ''
    if (msg.includes('invite_not_found')) throw new Error('This invite link is invalid.')
    if (msg.includes('invite_already_accepted')) {
      throw new Error('This invite has already been used.')
    }
    if (msg.includes('invite_expired')) throw new Error('This invite has expired.')
    if (msg.includes('invite_email_mismatch')) {
      throw new Error('This invite was sent to a different email address.')
    }
    if (msg.includes('user_already_in_firm')) {
      throw new Error('This account already belongs to a firm.')
    }
    if (msg.includes('email_already_member')) {
      throw new Error('This email is already on the team.')
    }
    throw new Error('Unable to accept invite. Please try again.')
  }

  return firmId as string
}

import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { getClientById } from '@/lib/supabase/clients'
import { getCurrentTaxYear } from '@/lib/supabase/tax-years'
import { NextResponse } from 'next/server'

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export async function GET() {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const client = await getClientById(session.clientId, session.firmId)
    if (!client) {
      return NextResponse.json({ error: 'Client not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    const taxYear = await getCurrentTaxYear(session.clientId, session.firmId)

    return NextResponse.json({
      name: client.name,
      email: client.email,
      initials: initialsFromName(client.name),
      taxYear: taxYear?.year ?? new Date().getFullYear(),
    })
  } catch (error) {
    console.error('GET /api/portal/session error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

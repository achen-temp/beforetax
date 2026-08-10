import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { getClientTaxData } from '@/lib/supabase/tax-data'
import { resolvePortalTaxYear } from '@/lib/tax/portal-active-year'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const taxYear = await resolvePortalTaxYear({
      clientId: session.clientId,
      firmId: session.firmId,
    })
    const data = await getClientTaxData(session.clientId, session.firmId, taxYear.year)
    if (!data) {
      return NextResponse.json({ error: 'Tax year not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/portal/tax-data error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

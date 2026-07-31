import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { getClientTaxData } from '@/lib/supabase/tax-data'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const data = await getClientTaxData(session.clientId, session.firmId)
    if (!data) {
      return NextResponse.json({ error: 'Tax year not found', code: 'NOT_FOUND' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/portal/tax-data error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

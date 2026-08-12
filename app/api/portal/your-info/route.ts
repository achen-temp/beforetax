import { NextResponse } from 'next/server'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { resolvePortalTaxYear } from '@/lib/tax/portal-active-year'
import { loadYourInfoView, saveHouseholdInfo } from '@/lib/supabase/household-info'
import {
  HouseholdInfoInputSchema,
  emptyHouseholdInfo,
  parseHouseholdInfo,
} from '@/lib/tax/household-info'

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

    const view = await loadYourInfoView({
      clientId: session.clientId,
      firmId: session.firmId,
      year: taxYear.year,
    })

    return NextResponse.json(view)
  } catch (error) {
    console.error('GET /api/portal/your-info error:', error)
    const message = error instanceof Error ? error.message : 'Something went wrong'
    const status = /019_household|isn’t set up/i.test(message) ? 503 : 500
    return NextResponse.json(
      { error: message, code: status === 503 ? 'MIGRATION_REQUIRED' : 'SERVER_ERROR' },
      { status }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = HouseholdInfoInputSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input', code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }

    const taxYear = await resolvePortalTaxYear({
      clientId: session.clientId,
      firmId: session.firmId,
    })

    const info = parseHouseholdInfo({
      ...emptyHouseholdInfo(),
      ...parsed.data,
      prefilledFromDocumentId: parsed.data.prefilledFromDocumentId ?? null,
    })

    const saved = await saveHouseholdInfo({
      clientId: session.clientId,
      firmId: session.firmId,
      year: taxYear.year,
      info,
    })

    return NextResponse.json({ year: taxYear.year, info: saved })
  } catch (error) {
    console.error('PUT /api/portal/your-info error:', error)
    const message = error instanceof Error ? error.message : 'Something went wrong'
    const status = /019_household|isn’t set up/i.test(message) ? 503 : 500
    return NextResponse.json(
      { error: message, code: status === 503 ? 'MIGRATION_REQUIRED' : 'SERVER_ERROR' },
      { status }
    )
  }
}

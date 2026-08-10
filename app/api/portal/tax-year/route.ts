import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getClientSessionFromCookies } from '@/lib/auth/client-token'
import { listPickerTaxYears, resolveTaxYear } from '@/lib/supabase/tax-years'
import { resolvePortalTaxYear } from '@/lib/tax/portal-active-year'
import {
  PORTAL_TAX_YEAR_COOKIE,
  PORTAL_TAX_YEAR_EXPLICIT_COOKIE,
  portalTaxYearCookieOptions,
} from '@/lib/tax/portal-tax-year-cookie'

const bodySchema = z.object({
  year: z.number().int().min(2000).max(2100),
})

/** Read the portal client's selected / active tax year and picker options. */
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
    const years = await listPickerTaxYears(session.clientId, session.firmId)

    return NextResponse.json({ year: taxYear.year, years })
  } catch (error) {
    console.error('GET /api/portal/tax-year error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

/** Persist the portal tax-year selection in a cookie and ensure the DB row. */
export async function POST(request: Request) {
  try {
    const session = await getClientSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid year', code: 'VALIDATION' }, { status: 400 })
    }

    const taxYear = await resolveTaxYear({
      clientId: session.clientId,
      firmId: session.firmId,
      requestedYear: parsed.data.year,
    })

    const opts = portalTaxYearCookieOptions()
    const response = NextResponse.json({ year: taxYear.year })
    response.cookies.set(PORTAL_TAX_YEAR_COOKIE, String(taxYear.year), opts)
    response.cookies.set(PORTAL_TAX_YEAR_EXPLICIT_COOKIE, '1', opts)
    return response
  } catch (error) {
    console.error('POST /api/portal/tax-year error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

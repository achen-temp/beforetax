import { getClientByPortalToken } from '@/lib/supabase/clients'
import { getFirmPortalBrand } from '@/lib/supabase/firms'
import { PortalTokenSchema } from '@/lib/validations/client'
import { NextResponse } from 'next/server'

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const result = PortalTokenSchema.safeParse({ token: searchParams.get('token') })

    if (!result.success) {
      return NextResponse.json({ error: 'Invalid portal link', code: 'INVALID_TOKEN' }, { status: 400 })
    }

    const client = await getClientByPortalToken(result.data.token)
    if (!client) {
      return NextResponse.json({ error: 'Portal link expired or invalid', code: 'NOT_FOUND' }, { status: 404 })
    }

    if (client.otp_expires_at && new Date(client.otp_expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Access code expired. Ask your CPA for a new link.', code: 'EXPIRED' },
        { status: 410 }
      )
    }

    const brand = await getFirmPortalBrand(client.firm_id)

    return NextResponse.json({
      name: client.name,
      email: maskEmail(client.email),
      firmName: brand.firmName,
      logoUrl: brand.logoUrl,
    })
  } catch (error) {
    console.error('GET /api/portal error:', error)
    return NextResponse.json({ error: 'Something went wrong', code: 'SERVER_ERROR' }, { status: 500 })
  }
}

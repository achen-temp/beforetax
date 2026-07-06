import { clearClientSessionCookie } from '@/lib/auth/client-token'
import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  clearClientSessionCookie(response)
  return response
}

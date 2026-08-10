import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const CLIENT_SESSION_COOKIE = 'client_session'
/** Short-lived portal link token after email login (before OTP verify). */
export const PORTAL_PENDING_COOKIE = 'bt_portal_pending'

export interface ClientSessionPayload {
  clientId: string
  firmId: string
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return new TextEncoder().encode(secret)
}

export async function createClientToken(clientId: string, firmId: string) {
  return new SignJWT({ clientId, firmId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifyClientToken(token: string): Promise<ClientSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    const clientId = payload.clientId as string | undefined
    const firmId = payload.firmId as string | undefined
    if (!clientId || !firmId) return null
    return { clientId, firmId }
  } catch {
    return null
  }
}

export async function getClientSessionFromCookies(): Promise<ClientSessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(CLIENT_SESSION_COOKIE)?.value
  if (!token) return null
  return verifyClientToken(token)
}

export function setClientSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  })
}

export function clearClientSessionCookie(response: NextResponse) {
  response.cookies.set(CLIENT_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export function setPortalPendingCookie(response: NextResponse, portalToken: string) {
  response.cookies.set(PORTAL_PENDING_COOKIE, portalToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60, // 1 hour to complete OTP
  })
}

export function clearPortalPendingCookie(response: NextResponse) {
  response.cookies.set(PORTAL_PENDING_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function getPortalPendingTokenFromCookies(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get(PORTAL_PENDING_COOKIE)?.value
  if (!value) return null
  // portal_token is a UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null
  }
  return value
}

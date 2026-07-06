import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export const CLIENT_SESSION_COOKIE = 'client_session'

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

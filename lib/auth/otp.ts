import crypto from 'crypto'
import bcrypt from 'bcryptjs'

export const OTP_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString()
}

export function generatePortalToken(): string {
  return crypto.randomUUID()
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, 10)
}

export async function verifyOtp(otp: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(otp, hashed)
}

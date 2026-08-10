import { z } from 'zod'

export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().max(20).optional(),
  /** When false, create the client record but don't email the portal OTP yet. */
  sendOtp: z.boolean().default(true),
})

export const VerifyOtpSchema = z.object({
  /** Optional when the pending portal cookie was set by email login. */
  token: z.string().uuid('Invalid portal link').optional(),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const PortalTokenSchema = z.object({
  token: z.string().uuid('Invalid portal link'),
})

/** Resend may omit token when the email-login pending cookie is present. */
export const PortalResendSchema = z.object({
  token: z.string().uuid('Invalid portal link').optional(),
})

export const PortalLoginEmailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

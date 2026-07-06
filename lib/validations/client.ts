import { z } from 'zod'

export const CreateClientSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().max(20).optional(),
})

export const VerifyOtpSchema = z.object({
  token: z.string().uuid('Invalid portal link'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const PortalTokenSchema = z.object({
  token: z.string().uuid('Invalid portal link'),
})

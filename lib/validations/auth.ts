import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 72

export function hasMinLength(password: string) {
  return password.length >= PASSWORD_MIN_LENGTH
}

export function hasUppercase(password: string) {
  return /[A-Z]/.test(password)
}

export function hasLowercase(password: string) {
  return /[a-z]/.test(password)
}

export function hasSpecialCharacter(password: string) {
  return /[^A-Za-z0-9]/.test(password)
}

export const PASSWORD_REQUIREMENTS = [
  {
    id: 'minLength',
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: hasMinLength,
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter (A–Z)',
    test: hasUppercase,
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter (a–z)',
    test: hasLowercase,
  },
  {
    id: 'special',
    label: 'One special character (!@#$…)',
    test: hasSpecialCharacter,
  },
] as const

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, 'Password is too long')
  .refine(hasUppercase, 'Password must contain an uppercase letter')
  .refine(hasLowercase, 'Password must contain a lowercase letter')
  .refine(hasSpecialCharacter, 'Password must contain a special character')

export const SignupApiSchema = z.object({
  firmName: z.string().min(1, 'Firm name is required').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: passwordSchema,
})

export const SignupFormSchema = SignupApiSchema.extend({
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type SignupFormValues = z.infer<typeof SignupFormSchema>

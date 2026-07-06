import type { AuthError } from '@supabase/supabase-js'

const AUTH_ERROR_CODES: Record<string, string> = {
  user_already_exists: 'An account with this email already exists.',
  email_exists: 'An account with this email already exists.',
  invalid_credentials: 'Invalid email or password.',
  weak_password: 'Password does not meet the requirements.',
  signup_disabled: 'Registration is currently unavailable. Please try again later.',
  over_request_rate_limit: 'Too many attempts. Please wait a moment and try again.',
  over_email_send_rate_limit: 'Too many emails sent. Please wait and try again.',
}

export function mapAuthError(error: AuthError | { message: string; code?: string }): string {
  if (error.code && AUTH_ERROR_CODES[error.code]) {
    return AUTH_ERROR_CODES[error.code]
  }

  const normalized = error.message.toLowerCase()

  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid credentials')
  ) {
    return 'Invalid email or password.'
  }

  if (
    normalized.includes('already registered') ||
    normalized.includes('already been registered') ||
    normalized.includes('user already registered')
  ) {
    return 'An account with this email already exists.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.'
  }

  return 'Something went wrong. Please try again.'
}

export function mapSignupError(error: AuthError | { message: string; code?: string }): string {
  return mapAuthError(error)
}

export function mapLoginError(error: AuthError | { message: string; code?: string }): string {
  return mapAuthError(error)
}

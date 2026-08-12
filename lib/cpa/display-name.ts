/** Format a CPA user's display name; falls back to email when names are missing. */
export function formatCpaName(input: {
  first_name?: string | null
  last_name?: string | null
  email: string
}): string {
  const first = input.first_name?.trim() ?? ''
  const last = input.last_name?.trim() ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  return full || input.email
}

export function formatCpaInitials(input: {
  first_name?: string | null
  last_name?: string | null
  email: string
  firmName?: string | null
}): string {
  const first = input.first_name?.trim()?.[0]
  const last = input.last_name?.trim()?.[0]
  if (first && last) return `${first}${last}`.toUpperCase()
  if (first) return first.toUpperCase()
  const firm = input.firmName?.trim()?.[0]
  if (firm) return firm.toUpperCase()
  return (input.email.trim()[0] ?? '?').toUpperCase()
}

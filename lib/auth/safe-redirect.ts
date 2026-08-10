const ALLOWED_PREFIXES = ['/dashboard', '/clients', '/settings', '/admin', '/account']

export function safeRedirect(path: string | null, fallback = '/clients'): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return fallback
  }

  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )

  return allowed ? path : fallback
}

'use client'

import { useEffect } from 'react'

/** Redirects legacy Supabase email links that land on /#access_token=... */
export function HashSessionRedirect() {
  useEffect(() => {
    const { pathname, hash, search } = window.location
    if (hash.includes('access_token') && pathname !== '/auth/callback') {
      window.location.replace(`/auth/callback${search}${hash}`)
    }
  }, [])

  return null
}

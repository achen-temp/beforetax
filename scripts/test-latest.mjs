// One-off manual test: run the real extraction pipeline on the most recently
// uploaded document and print the tax-data view the portal page renders.
// Run: node --env-file=.env.local scripts/test-latest.mjs
import { createClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: docs, error } = await admin
  .from('documents')
  .select('id, client_id, firm_id, file_name, file_type, extraction_status, created_at')
  .order('created_at', { ascending: false })
  .limit(1)

if (error) throw error
const doc = docs?.[0]
if (!doc) {
  console.log('No documents found in the database.')
  process.exit(0)
}
console.log('=== Latest uploaded document ===')
console.log(JSON.stringify(doc, null, 2))

const token = await new SignJWT({ clientId: doc.client_id, firmId: doc.firm_id })
  .setProtectedHeader({ alg: 'HS256' })
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode(process.env.JWT_SECRET))
const cookie = `client_session=${token}`

console.log('\n=== Running /process (classify + extract) ... ===')
const p = await fetch(`${base}/api/portal/documents/${doc.id}/process`, {
  method: 'POST',
  headers: { Cookie: cookie },
})
console.log('HTTP', p.status)
console.log(JSON.stringify(await p.json(), null, 2))

console.log('\n=== Tax-data view (what the portal page renders) ===')
const t = await fetch(`${base}/api/portal/tax-data`, { headers: { Cookie: cookie } })
console.log('HTTP', t.status)
console.log(JSON.stringify(await t.json(), null, 2))

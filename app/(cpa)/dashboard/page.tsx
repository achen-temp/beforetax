import { redirect } from 'next/navigation'

/** Legacy entry — Clients is the CPA home. Keep this route so old bookmarks land cleanly. */
export default function DashboardPage() {
  redirect('/clients')
}

import { AcceptInviteForm } from '@/components/auth/accept-invite-form'

type PageProps = {
  params: Promise<{ token: string }>
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params
  return <AcceptInviteForm token={token} />
}

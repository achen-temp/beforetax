import { LegalPage } from '@/components/legal-page'
import { PLATFORM_NAME } from '@/lib/brand'

export const metadata = { title: 'Security' }

export default function SecurityPage() {
  return (
    <LegalPage title="Security">
      <p>
        This is a placeholder security overview for {PLATFORM_NAME}. Replace it with
        your finalized security documentation before going live.
      </p>
      <p>
        Data is encrypted in transit and at rest. Each CPA firm’s data is isolated,
        and client portals are protected with one-time-passcode (OTP) access.
      </p>
      <p>
        To report a security concern, contact your CPA firm.
      </p>
    </LegalPage>
  )
}

import { LegalPage } from '@/components/legal-page'
import { PLATFORM_NAME } from '@/lib/brand'

export const metadata = { title: 'Privacy Policy' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        This is a placeholder privacy policy for {PLATFORM_NAME}. Replace it with your
        firm’s finalized policy before going live.
      </p>
      <p>
        {PLATFORM_NAME} processes tax documents on behalf of CPA firms and their
        clients. Documents and extracted data are stored securely, isolated per
        firm, and used only to provide the intake and extraction service.
      </p>
      <p>
        For questions about how your data is handled, contact your CPA firm.
      </p>
    </LegalPage>
  )
}

import { LegalPage } from '@/components/legal-page'
import { PLATFORM_NAME } from '@/lib/brand'

export const metadata = { title: 'Terms of Service' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These are placeholder terms of service for {PLATFORM_NAME}. Replace them with
        your finalized terms before going live.
      </p>
      <p>
        By using {PLATFORM_NAME}, CPA firms and their clients agree to use the service
        only for legitimate tax document intake and processing.
      </p>
      <p>
        For questions about these terms, contact your CPA firm.
      </p>
    </LegalPage>
  )
}

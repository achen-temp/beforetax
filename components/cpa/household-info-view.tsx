import { FILING_STATUS_LABELS, isHouseholdEmpty, type HouseholdInfo } from '@/lib/tax/household-info'

export function HouseholdInfoView({
  info,
  suggestionFileName,
}: {
  info: HouseholdInfo
  /** Prior-return file the client could apply, if they haven't saved yet. */
  suggestionFileName?: string | null
}) {
  if (isHouseholdEmpty(info)) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">This client hasn’t saved household info yet.</p>
        {suggestionFileName ? (
          <p className="mt-2 text-sm text-slate-400">
            A prior-year return ({suggestionFileName}) is available in the portal for them to
            review and apply.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            They can fill this in under Your info in the client portal.
          </p>
        )}
      </div>
    )
  }

  const address = [info.addressStreet, info.addressCity, info.addressState, info.addressZip]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-4">
      <Section title="Filing status">
        <Row
          label="Status"
          value={info.filingStatus ? FILING_STATUS_LABELS[info.filingStatus] : ''}
        />
      </Section>

      <Section title="Taxpayer">
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Full name" value={info.taxpayerName} />
          <Row label="SSN" value={info.taxpayerSsn} />
          <Row label="Date of birth" value={info.taxpayerDob} />
          <Row label="Phone" value={info.phone} />
        </div>
      </Section>

      <Section title="Spouse">
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Full name" value={info.spouseName} />
          <Row label="SSN" value={info.spouseSsn} />
          <Row label="Date of birth" value={info.spouseDob} />
        </div>
      </Section>

      <Section title="Address">
        <Row label="Address" value={address} />
      </Section>

      <Section title="Dependents">
        {info.dependents.length === 0 ? (
          <p className="text-sm text-slate-400">None listed.</p>
        ) : (
          <ul className="space-y-3">
            {info.dependents.map((dep, index) => (
              <li
                key={`${dep.name}-${index}`}
                className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Row label="Name" value={dep.name} />
                  <Row label="SSN" value={dep.ssn} />
                  <Row label="Relationship" value={dep.relationship} />
                  <Row label="Date of birth" value={dep.dob} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Refund direct deposit">
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Routing number" value={info.refundRoutingNumber} />
          <Row label="Account number" value={info.refundAccountNumber} />
          <Row label="Account type" value={info.refundAccountType} />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm ${value.trim() ? 'text-slate-900' : 'text-slate-300'}`}>
        {value.trim() || '—'}
      </p>
    </div>
  )
}

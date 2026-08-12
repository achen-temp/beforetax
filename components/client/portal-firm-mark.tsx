/** Firm mark for portal + CPA chrome. Uses logo when set; otherwise initial. */
export function PortalFirmMark({
  firmName,
  logoUrl,
  subtitle,
  iconClassName = 'size-8 text-xs',
  textClassName = 'text-base',
}: {
  firmName: string | null | undefined
  logoUrl?: string | null
  /** Line under the firm name, e.g. "Welcome, Max". Omit to hide. */
  subtitle?: string | null
  iconClassName?: string
  textClassName?: string
}) {
  const name = firmName?.trim() || 'Your firm'
  const letter = (name[0] ?? 'P').toUpperCase()
  const logo = logoUrl?.trim() || null
  const line = subtitle?.trim() || null

  return (
    <div className="flex min-w-0 items-center gap-2">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- firm-uploaded logo from Storage
        <img
          src={logo}
          alt=""
          className={`shrink-0 rounded-lg object-contain ${iconClassName}`}
        />
      ) : (
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg bg-[#0061FF] font-bold text-white ${iconClassName}`}
        >
          {letter}
        </div>
      )}
      <div className="min-w-0">
        <p className={`truncate font-bold tracking-tight text-slate-900 ${textClassName}`}>
          {name}
        </p>
        {line ? (
          <p className="truncate text-sm text-slate-500">{line}</p>
        ) : null}
      </div>
    </div>
  )
}

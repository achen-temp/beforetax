import { PLATFORM_LOGO_LETTER, PLATFORM_NAME } from '@/lib/brand'

export function BrandLogo({
  iconClassName = 'size-9 text-sm',
  textClassName = 'text-lg',
}: {
  iconClassName?: string
  textClassName?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center justify-center rounded-lg bg-[#0061FF] font-bold text-white ${iconClassName}`}
      >
        {PLATFORM_LOGO_LETTER}
      </div>
      <span className={`font-bold tracking-tight text-slate-900 ${textClassName}`}>
        {PLATFORM_NAME}
      </span>
    </div>
  )
}

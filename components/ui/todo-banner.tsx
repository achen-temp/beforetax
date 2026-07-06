import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TodoBannerProps {
  title: string
  children: ReactNode
  className?: string
}

export function TodoBanner({ title, children, className }: TodoBannerProps) {
  return (
    <div
      role="note"
      className={cn(
        'rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950',
        'dark:border-red-800 dark:bg-red-950/50 dark:text-red-100',
        className
      )}
    >
      <div className="flex gap-2">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-2">
          <p className="font-semibold tracking-tight">
            <span className="text-red-600 dark:text-red-400">TODO</span>
            {' — '}
            {title}
          </p>
          <div className="text-xs leading-relaxed opacity-95">{children}</div>
        </div>
      </div>
    </div>
  )
}

export function TodoBannerCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-[11px] dark:bg-red-900/60">
      {children}
    </code>
  )
}

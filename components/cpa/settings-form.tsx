'use client'

import { useState, useTransition } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { saveFirmSettings } from '@/app/(cpa)/settings/actions'
import type { FirmSettings } from '@/lib/supabase/firm-settings'

/** Accessible on/off switch (no external dep). Controlled by the parent. */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export function SettingsForm({ settings }: { settings: FirmSettings }) {
  const [skipDuplicates, setSkipDuplicates] = useState(settings.skipDuplicateUploads)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  function updateSkipDuplicates(next: boolean) {
    const previous = skipDuplicates
    setSkipDuplicates(next)
    setStatus('idle')
    setError(null)
    startTransition(async () => {
      const result = await saveFirmSettings({ skipDuplicateUploads: next })
      if (!result.ok) {
        setSkipDuplicates(previous)
        setStatus('error')
        setError(result.error)
        return
      }
      // Trust the value that actually persisted (handles false correctly).
      setSkipDuplicates(result.settings.skipDuplicateUploads)
      setStatus('saved')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Document Uploads Settings</CardTitle>
        <CardDescription hidden>
          How the client portal handles files your clients upload.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-1">
            <p className="text-sm font-medium">Skip duplicate files</p>
            <p className="text-sm text-muted-foreground">
              When on, re-uploading exact same file is not allowed.
            </p>
          </div>
          <Toggle
            checked={skipDuplicates}
            disabled={pending}
            onChange={updateSkipDuplicates}
            label="Skip duplicate files"
          />
        </div>

        <div className="min-h-4 text-sm" aria-live="polite">
          {pending && <span className="text-muted-foreground">Saving…</span>}
          {!pending && status === 'saved' && (
            <span className="text-emerald-600">Saved</span>
          )}
          {!pending && status === 'error' && (
            <span className="text-destructive">
              {error ?? 'Couldn’t save. Please try again.'}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

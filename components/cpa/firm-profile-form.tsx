'use client'

import { useRef, useState, useTransition } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  clearFirmLogo,
  saveFirmLogo,
  saveFirmProfile,
} from '@/app/(cpa)/settings/actions'

/** Firm identity: name + logo + document intake email. */
export function FirmProfileForm({
  firmName,
  documentIntakeEmail,
  logoUrl,
}: {
  firmName: string
  documentIntakeEmail: string
  logoUrl: string | null
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(firmName)
  const [intakeEmail, setIntakeEmail] = useState(documentIntakeEmail)
  const [logo, setLogo] = useState<string | null>(logoUrl)
  const [pending, startTransition] = useTransition()
  const [logoPending, startLogoTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [logoStatus, setLogoStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('idle')
    setError(null)
    startTransition(async () => {
      const result = await saveFirmProfile({
        firmName: name,
        documentIntakeEmail: intakeEmail,
      })
      if (!result.ok) {
        setStatus('error')
        setError(result.error)
        return
      }
      setName(result.firmName)
      setIntakeEmail(result.documentIntakeEmail)
      setStatus('saved')
    })
  }

  function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoStatus('idle')
    setLogoError(null)
    const formData = new FormData()
    formData.set('logo', file)
    startLogoTransition(async () => {
      const result = await saveFirmLogo(formData)
      if (!result.ok) {
        setLogoStatus('error')
        setLogoError(result.error)
        return
      }
      setLogo(result.logoUrl)
      setLogoStatus('saved')
      if (fileRef.current) fileRef.current.value = ''
    })
  }

  function onRemoveLogo() {
    setLogoStatus('idle')
    setLogoError(null)
    startLogoTransition(async () => {
      const result = await clearFirmLogo()
      if (!result.ok) {
        setLogoStatus('error')
        setLogoError(result.error)
        return
      }
      setLogo(null)
      setLogoStatus('saved')
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firm profile</CardTitle>
        <CardDescription hidden>
          How your firm appears in the client portal and OTP emails. Name and logo
          show in the portal header; the intake email is what taxpayers see under
          “Email documents to.” Defaults to the owner email from signup.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="size-full object-contain p-1" />
            ) : (
              <span className="text-lg font-bold text-[#0061FF]">
                {(name.trim()[0] ?? 'F').toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="firmLogo">Firm logo</Label>
            <p className="text-xs text-muted-foreground" hidden>
              PNG, JPEG, or WebP · max 1MB. Stored in file storage; only the URL is
              saved on your firm record.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                id="firmLogo"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={logoPending}
                onChange={onLogoSelected}
                className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
              />
              {logo && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={logoPending}
                  onClick={onRemoveLogo}
                >
                  Remove Logo
                </Button>
              )}
            </div>
            <p className="min-h-4 text-sm" aria-live="polite">
              {logoPending && <span className="text-muted-foreground">Uploading…</span>}
              {!logoPending && logoStatus === 'saved' && (
                <span className="text-emerald-600">Logo saved</span>
              )}
              {!logoPending && logoStatus === 'error' && (
                <span className="text-destructive">
                  {logoError ?? 'Couldn’t upload logo.'}
                </span>
              )}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="space-y-2">
            <Label htmlFor="firmName">Firm name</Label>
            <Input
              id="firmName"
              type="text"
              autoComplete="organization"
              required
              maxLength={100}
              disabled={pending}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setStatus('idle')
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentIntakeEmail">Tax document receiving email</Label>
            <Input
              id="documentIntakeEmail"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              disabled={pending}
              value={intakeEmail}
              onChange={(e) => {
                setIntakeEmail(e.target.value)
                setStatus('idle')
              }}
            />
            <p className="text-xs text-muted-foreground" hidden>
              Shown in the client portal so taxpayers know where to email forms
              and statements. Does not change your login email.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={pending || !name.trim() || !intakeEmail.trim()}
            >
              {pending ? 'Saving…' : 'Save firm profile'}
            </Button>
            <span className="min-h-4 text-sm" aria-live="polite">
              {status === 'saved' && <span className="text-emerald-600">Saved</span>}
              {status === 'error' && (
                <span className="text-destructive">
                  {error ?? 'Couldn’t save. Please try again.'}
                </span>
              )}
            </span>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

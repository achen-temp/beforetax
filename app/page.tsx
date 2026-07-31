import Link from 'next/link'
import { ArrowRight, FileText, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { PLATFORM_NAME, PLATFORM_TAGLINE } from '@/lib/brand'

const FEATURES = [
  {
    icon: Sparkles,
    iconClass: 'bg-blue-50 text-[#0061FF]',
    title: 'AI document extraction',
    description: 'Drop in a W-2, 1099, or 1098 and we read every box automatically — no manual entry.',
  },
  {
    icon: FileText,
    iconClass: 'bg-violet-50 text-violet-600',
    title: 'Any format, any device',
    description: 'PDFs, phone photos, scans, even Word and Excel. Clients upload however is easiest.',
  },
  {
    icon: ShieldCheck,
    iconClass: 'bg-emerald-50 text-emerald-600',
    title: 'Secure by default',
    description: 'Bank-level encryption, per-firm isolation, and OTP-protected client portals.',
  },
] as const

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 lg:px-8">
          <BrandLogo />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="text-slate-600">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="bg-[#0061FF] hover:bg-[#0052d9]">
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 lg:px-8 lg:pt-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-[#0061FF]">
              <Sparkles className="size-3.5" />
              {PLATFORM_TAGLINE}
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Tax document intake,{' '}
              <span className="text-[#0061FF]">automated</span>.
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              {PLATFORM_NAME} collects tax documents from your clients, extracts the data with AI,
              and hands you clean, exportable records — so your firm spends less time on data entry.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full bg-[#0061FF] hover:bg-[#0052d9] sm:w-auto">
                <Link href="/signup">
                  Start your firm free
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full border-slate-300 sm:w-auto">
                <Link href="/login">Log in to your firm</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-16 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, iconClass, title, description }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div
                  className={`flex size-11 items-center justify-center rounded-xl ${iconClass}`}
                >
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-20 lg:px-8">
          <div className="flex flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                <Mail className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Are you a client?</p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Check your email for the secure link your CPA sent to upload your documents.
                </p>
              </div>
            </div>
            <Button asChild variant="outline" className="shrink-0 border-slate-300">
              <Link href="/portal">Open client portal</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-400 sm:flex-row lg:px-8">
          <BrandLogo iconClassName="size-6 text-xs" textClassName="text-sm" />
          <p>© {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

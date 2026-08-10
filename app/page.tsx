import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { PLATFORM_NAME, PLATFORM_TAGLINE } from '@/lib/brand'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f6fb]">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5 lg:px-8">
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

      <main className="flex flex-1 items-center">
        <section className="mx-auto w-full max-w-3xl px-6 pb-24 text-center lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-[#0061FF]">
            <Sparkles className="size-3.5" />
            {PLATFORM_TAGLINE}
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl">
            Collecting tax documents,
            <br className="hidden sm:block" />{' '}
            the <span className="text-[#0061FF]">simplest</span> way.
          </h1>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full bg-[#0061FF] hover:bg-[#0052d9] sm:w-auto">
              <Link href="/signup">
                Start your firm free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full border-slate-300 sm:w-auto">
              <Link href="/login">Log in</Link>
            </Button>
          </div>

          <p className="mt-8 text-sm text-slate-400">
            Are you a taxpayer? Check your email for the secure upload link from your CPA.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-6 py-6 text-sm text-slate-400 sm:flex-row lg:px-8">
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-600">Privacy</Link>
            <Link href="/security" className="hover:text-slate-600">Security</Link>
            <Link href="/terms" className="hover:text-slate-600">Terms</Link>
          </nav>
          <p>© {new Date().getFullYear()} {PLATFORM_NAME}</p>
        </div>
      </footer>
    </div>
  )
}

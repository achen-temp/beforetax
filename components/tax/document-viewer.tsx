'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, FileWarning, Loader2 } from 'lucide-react'

interface FileInfo {
  url: string
  mimeType: string
  fileName: string
}

/**
 * Renders the original document (PDF or image) from a short-lived signed URL
 * fetched via `fileEndpoint`. For PDFs, `initialPage` deep-links the built-in
 * browser viewer to the relevant page (used for segmented children).
 */
export function DocumentViewer({
  fileEndpoint,
  initialPage,
}: {
  fileEndpoint: string
  initialPage?: number
}) {
  const [info, setInfo] = useState<FileInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(fileEndpoint)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not load document')
        if (!cancelled) {
          setInfo({ url: data.url, mimeType: data.mimeType, fileName: data.fileName })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load document')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fileEndpoint])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (error || !info) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
        <FileWarning className="size-6 text-slate-300" />
        <p>{error ?? 'Document unavailable'}</p>
      </div>
    )
  }

  const isImage = info.mimeType.startsWith('image/')
  const isPdf = info.mimeType === 'application/pdf' || info.fileName.toLowerCase().endsWith('.pdf')
  const pdfSrc = isPdf && initialPage ? `${info.url}#page=${initialPage}&view=FitH` : info.url

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="truncate text-xs text-slate-500">{info.fileName}</span>
        <a
          href={info.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ExternalLink className="size-3" />
          Open
        </a>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.url} alt={info.fileName} className="mx-auto max-w-full" />
        ) : (
          <iframe title={info.fileName} src={pdfSrc} className="h-full w-full border-0" />
        )}
      </div>
    </div>
  )
}

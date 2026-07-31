/**
 * Single source of truth for accepted uploads. Drives the portal dropzone
 * (accept map), client-side validation, and the upload API. Keep this in sync
 * with lib/tax/prepare-input.ts, which does the actual per-format handling.
 */

export const MAX_FILE_SIZE_MB = 20
export const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024

/** mime type -> file extensions. Format matches react-dropzone's `accept`. */
export const ACCEPTED_FILE_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'image/tiff': ['.tif', '.tiff'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel': ['.xls'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
  'application/rtf': ['.rtf'],
  'text/rtf': ['.rtf'],
}

export const ALLOWED_MIME_TYPES = Object.keys(ACCEPTED_FILE_TYPES)
export const ALLOWED_EXTENSIONS = Array.from(new Set(Object.values(ACCEPTED_FILE_TYPES).flat()))

/** Formats we recommend (best extraction accuracy) vs. everything accepted. */
export const RECOMMENDED_FORMATS_LABEL = 'PDF, or a clear photo/scan (JPG, PNG, HEIC)'
export const SUPPORTED_FORMATS_LABEL = 'PDF, JPG, PNG, HEIC, TIFF, Word, Excel, CSV, HTML'

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

/**
 * Accept by mime type when the browser provides a known one, otherwise fall back
 * to the file extension. HEIC and some Office files are often sent with an empty
 * or generic mime, so the extension fallback matters in practice.
 */
export function isAllowedUpload(mimeType: string, fileName: string): boolean {
  if (mimeType && ALLOWED_MIME_TYPES.includes(mimeType)) return true
  return ALLOWED_EXTENSIONS.includes(extensionOf(fileName))
}

export function validateFile(file: File) {
  if (!isAllowedUpload(file.type, file.name)) {
    throw new Error(`Unsupported file type. Accepted: ${SUPPORTED_FORMATS_LABEL}.`)
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE_MB}MB).`)
  }
}

/** 64-char lowercase hex — the shape of a SHA-256 digest. Used to validate the
 * client-supplied hash server-side before trusting it for dedup. */
export const FILE_HASH_PATTERN = /^[a-f0-9]{64}$/

/**
 * Content hash of a file, computed in the browser via Web Crypto. We hash the
 * bytes before requesting an upload URL so the server can reject an identical
 * re-upload without ever seeing the file (bytes go straight to Storage). SHA-256
 * makes a collision between two different files effectively impossible, so an
 * equal hash means equal content. Requires a secure context (https/localhost).
 */
export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

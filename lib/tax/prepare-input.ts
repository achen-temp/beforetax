import 'server-only'
import type { DocumentInput } from '@/lib/tax/extract-document'

/**
 * Normalizes any uploaded file into DocumentInput[] the model can consume,
 * following the hybrid strategy:
 *   - API-native (PDF, common images): passed through as-is
 *   - HEIC/TIFF: converted to JPEG (vision APIs don't accept them)
 *   - Word / Excel / CSV / HTML / RTF: text extracted upstream and sent as text
 *
 * Node-only (uses sharp/heic-convert/mammoth/xlsx) — call from a route with
 * `export const runtime = 'nodejs'`. Returns multiple inputs for multi-page
 * sources (e.g. multi-page TIFF -> one image per page).
 */

export class UnsupportedFileTypeError extends Error {
  constructor(descriptor: string) {
    super(`Unsupported file type: ${descriptor}`)
    this.name = 'UnsupportedFileTypeError'
  }
}

export interface RawFile {
  data: Uint8Array | Buffer
  mimeType: string
  filename: string
}

type Kind =
  | 'pdf'
  | 'image_native'
  | 'image_heic'
  | 'image_tiff'
  | 'word'
  | 'excel'
  | 'csv_text'
  | 'html'
  | 'rtf'

const NATIVE_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

/** Resolve a handling kind from mime type, falling back to file extension when
 * the upload arrives as a generic type (application/octet-stream is common). */
function resolveKind(mimeType: string, filename: string): Kind {
  const mime = mimeType.toLowerCase()
  const ext = extensionOf(filename)

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (mime === 'image/heic' || mime === 'image/heif' || ext === 'heic' || ext === 'heif') return 'image_heic'
  if (mime === 'image/tiff' || ext === 'tif' || ext === 'tiff') return 'image_tiff'
  if (NATIVE_IMAGE_MIMES.has(mime) || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
    return 'image_native'
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return 'word'
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xls'
  ) {
    return 'excel'
  }
  if (mime === 'text/csv' || mime === 'text/plain' || ext === 'csv' || ext === 'txt') return 'csv_text'
  if (mime === 'text/html' || ext === 'html' || ext === 'htm') return 'html'
  if (mime === 'application/rtf' || mime === 'text/rtf' || ext === 'rtf') return 'rtf'

  throw new UnsupportedFileTypeError(`${mimeType} (${filename})`)
}

function toBuffer(data: Uint8Array | Buffer): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data)
}

/** Wrap extracted text so the model can tell document content from instructions. */
function asDocumentText(filename: string, text: string): DocumentInput {
  const trimmed = text.trim()
  return {
    text: `----- BEGIN DOCUMENT (${filename}) -----\n${trimmed}\n----- END DOCUMENT -----`,
  }
}

export async function prepareDocumentInputs(file: RawFile): Promise<DocumentInput[]> {
  const kind = resolveKind(file.mimeType, file.filename)
  const buffer = toBuffer(file.data)

  switch (kind) {
    case 'pdf':
      return [{ base64: buffer.toString('base64'), mimeType: 'application/pdf', filename: file.filename }]

    case 'image_native':
      return [{ base64: buffer.toString('base64'), mimeType: file.mimeType, filename: file.filename }]

    case 'image_heic':
      return [await heicToJpeg(buffer, file.filename)]

    case 'image_tiff':
      return await tiffToJpegs(buffer, file.filename)

    case 'word':
      return [asDocumentText(file.filename, await wordToText(buffer))]

    case 'excel':
      return [asDocumentText(file.filename, await excelToText(buffer))]

    case 'csv_text':
      return [asDocumentText(file.filename, buffer.toString('utf-8'))]

    case 'html':
      return [asDocumentText(file.filename, await htmlToText(buffer))]

    case 'rtf':
      return [asDocumentText(file.filename, rtfToText(buffer.toString('utf-8')))]
  }
}

async function heicToJpeg(buffer: Buffer, filename: string): Promise<DocumentInput> {
  const convert = (await import('heic-convert')).default
  const output = await convert({ buffer, format: 'JPEG', quality: 0.9 })
  return {
    base64: Buffer.from(output).toString('base64'),
    mimeType: 'image/jpeg',
    filename: `${filename}.jpg`,
  }
}

async function tiffToJpegs(buffer: Buffer, filename: string): Promise<DocumentInput[]> {
  const sharp = (await import('sharp')).default
  const pages = (await sharp(buffer).metadata()).pages ?? 1
  const inputs: DocumentInput[] = []
  for (let page = 0; page < pages; page++) {
    const jpeg = await sharp(buffer, { page }).jpeg({ quality: 90 }).toBuffer()
    inputs.push({
      base64: jpeg.toString('base64'),
      mimeType: 'image/jpeg',
      filename: `${filename}#p${page + 1}.jpg`,
    })
  }
  return inputs
}

async function wordToText(buffer: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')).default
  const { value } = await mammoth.extractRawText({ buffer })
  return value
}

async function excelToText(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  return workbook.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name])
    return `# Sheet: ${name}\n${csv}`
  }).join('\n\n')
}

async function htmlToText(buffer: Buffer): Promise<string> {
  const { convert } = await import('html-to-text')
  return convert(buffer.toString('utf-8'), { wordwrap: false })
}

/** Best-effort RTF -> text (no maintained JS lib); strips control words/groups. */
function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

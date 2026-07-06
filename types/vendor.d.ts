// Minimal type shims for dependencies that ship without their own types.
// Only the surface we actually use is declared.

declare module 'heic-convert' {
  interface HeicConvertOptions {
    buffer: Buffer | ArrayBuffer | Uint8Array
    format: 'JPEG' | 'PNG'
    quality?: number
  }
  function convert(options: HeicConvertOptions): Promise<ArrayBuffer>
  export default convert
}

declare module 'mammoth' {
  interface ExtractInput {
    buffer?: Buffer
    path?: string
    arrayBuffer?: ArrayBuffer
  }
  interface ExtractResult {
    value: string
    messages: Array<{ type: string; message: string }>
  }
  export function extractRawText(input: ExtractInput): Promise<ExtractResult>
  export function convertToHtml(input: ExtractInput): Promise<ExtractResult>
  const mammoth: {
    extractRawText: typeof extractRawText
    convertToHtml: typeof convertToHtml
  }
  export default mammoth
}

declare module 'html-to-text' {
  interface HtmlToTextOptions {
    wordwrap?: number | false
    [key: string]: unknown
  }
  export function convert(html: string, options?: HtmlToTextOptions): string
}

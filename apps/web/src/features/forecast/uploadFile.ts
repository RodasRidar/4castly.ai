const CONTENT_TYPES: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  csv: 'text/csv',
}

export const ACCEPTED_EXTENSIONS = Object.keys(CONTENT_TYPES)
export const ACCEPT_ATTRIBUTE = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',')

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

/** The dropzone does not filter by `accept` on drops, so the page checks the extension itself. */
export function isSupportedFile(name: string): boolean {
  return name.includes('.') && extensionOf(name) in CONTENT_TYPES
}

export function contentTypeOf(file: Pick<File, 'name' | 'type'>): string {
  return file.type || CONTENT_TYPES[extensionOf(file.name)] || 'application/octet-stream'
}

export function sizeParts(bytes: number): { value: number; unit: 'KB' | 'MB' } {
  return bytes >= 1024 * 1024 ? { value: bytes / (1024 * 1024), unit: 'MB' } : { value: Math.max(1, bytes / 1024), unit: 'KB' }
}

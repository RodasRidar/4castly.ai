/**
 * The API returns message keys such as `assistant.tool.reviewingCritical` and `errors.assistant`. This area
 * keeps its copy under `chat.*`, so backend keys are mapped into that namespace here. Anything not listed
 * falls back to the generic error text instead of rendering a raw key.
 */
const KNOWN: Record<string, string> = {
  'assistant.tool.reviewingCritical': 'chat.tool.reviewingCritical',
  'assistant.tool.searchingProducts': 'chat.tool.searchingProducts',
  'assistant.tool.readingProduct': 'chat.tool.readingProduct',
  'errors.assistant': 'chat.errors.assistant',
  'errors.rateLimited': 'chat.errors.rateLimited',
  'errors.internal': 'chat.errors.generic',
}

export function backendKey(key: string): string {
  return KNOWN[key] ?? 'chat.errors.generic'
}

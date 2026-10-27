/**
 * The API returns message keys such as `assistant.tool.get_run_summary` and `errors.assistantUnavailable`.
 * This area keeps its copy under `chat.*`, so backend keys are mapped into that namespace here. A tool line
 * is never an error: an unknown tool shows a neutral "working" text, and unknown errors the generic one.
 */
const TOOLS: Record<string, string> = {
  get_run_summary: 'chat.tool.getRunSummary',
  find_products: 'chat.tool.findProducts',
  get_product_detail: 'chat.tool.getProductDetail',
  simulate_purchase: 'chat.tool.simulatePurchase',
  get_parameters: 'chat.tool.getParameters',
  // Keys the mock fixtures use.
  reviewingCritical: 'chat.tool.reviewingCritical',
  searchingProducts: 'chat.tool.searchingProducts',
  readingProduct: 'chat.tool.readingProduct',
}

const ERRORS: Record<string, string> = {
  'errors.assistant': 'chat.errors.assistant',
  'errors.assistantUnavailable': 'chat.errors.unavailable',
  'errors.unavailable': 'chat.errors.unavailable',
  'errors.timeout': 'chat.errors.timeout',
  'errors.assistantRefusal': 'chat.errors.refusal',
  'errors.rateLimited': 'chat.errors.rateLimited',
  'errors.internal': 'chat.errors.generic',
}

const TOOL_PREFIX = 'assistant.tool.'

export function toolKey(key: string): string {
  return (key.startsWith(TOOL_PREFIX) ? TOOLS[key.slice(TOOL_PREFIX.length)] : undefined) ?? 'chat.tool.working'
}

export function backendKey(key: string): string {
  return ERRORS[key] ?? 'chat.errors.generic'
}

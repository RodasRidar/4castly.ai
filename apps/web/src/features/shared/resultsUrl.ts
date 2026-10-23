import type { AbcClass, FilterLink, ProductSort, RiskLevel, SortOrder } from '../../services/types'

/**
 * URL state of the results screens (plan 2.1): filters, sort and page live in the query string so a view is
 * shareable and survives reload. Param names are the user-visible Spanish ones; values are the API's.
 */
export interface ResultsState {
  q: string
  risk: RiskLevel[]
  abc: AbcClass[]
  page: number
  sort: ProductSort
  order: SortOrder
  view: 'chat' | 'portfolio'
}

const RISKS: RiskLevel[] = ['critical', 'medium', 'optimal']
const CLASSES: AbcClass[] = ['A', 'B', 'C']
const SORTS: ProductSort[] = ['name', 'abc_class', 'typical_demand', 'current_stock', 'coverage', 'risk', 'suggested_quantity', 'buy_before', 'lead_time']
const DEFAULTS: ResultsState = { q: '', risk: [], abc: [], page: 1, sort: 'risk', order: 'asc', view: 'chat' }

const list = <T extends string>(raw: string | null, allowed: T[]): T[] =>
  (raw ?? '').split(',').filter((v): v is T => (allowed as string[]).includes(v))

export function parseResultsParams(params: URLSearchParams): ResultsState {
  const [sortRaw, orderRaw] = (params.get('orden') ?? '').split(':')
  const page = Number.parseInt(params.get('pagina') ?? '', 10)
  return {
    q: params.get('q') ?? '',
    risk: list(params.get('riesgo'), RISKS),
    abc: list(params.get('abc'), CLASSES),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    sort: (SORTS as string[]).includes(sortRaw) ? (sortRaw as ProductSort) : DEFAULTS.sort,
    order: orderRaw === 'asc' || orderRaw === 'desc' ? orderRaw : DEFAULTS.order,
    view: params.get('vista') === 'portafolio' ? 'portfolio' : 'chat',
  }
}

/** Query string (with leading `?`, or empty) holding only the non-default values. */
export function resultsSearch(state: ResultsState): string {
  const params = new URLSearchParams()
  if (state.q) params.set('q', state.q)
  if (state.risk.length) params.set('riesgo', state.risk.join(','))
  if (state.abc.length) params.set('abc', state.abc.join(','))
  if (state.page > 1) params.set('pagina', String(state.page))
  if (state.sort !== DEFAULTS.sort || state.order !== DEFAULTS.order) params.set('orden', `${state.sort}:${state.order}`)
  if (state.view === 'portfolio') params.set('vista', 'portafolio')
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** A figure the assistant cites becomes a link that applies the same filter to the results. */
export function filterLinkHref(conversationId: string, link: FilterLink): string {
  const params = new URLSearchParams()
  if (link.q) params.set('q', link.q)
  if (link.risk) params.set('riesgo', link.risk)
  if (link.abc) params.set('abc', link.abc)
  const text = params.toString()
  return `/c/${conversationId}${text ? `?${text}` : ''}`
}

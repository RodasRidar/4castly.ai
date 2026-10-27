import runProducts from './fixtures/run-products.json'
import runDetails from './fixtures/run-product-details.json'
import runSummary from './fixtures/run-summary.json'
import { failure } from './errors'
import type { ProductQuery, RunService } from '../ports'
import type { ProductDetail, ProductOverrides, ProductRow, ProductSort, RunParameters, RunSummary } from '../types'

/** A run whose file had no stock column (D17-C), built by hand from the stock fixtures: never generated. */
export const NO_STOCK_RUN_ID = '6f1c2f64-0b5a-5c3e-9c7e-5d0a4c1e7b21'
export const NO_STOCK_CONVERSATION_ID = '8d2e4a10-7c3b-5f19-a6d4-3b9e1c0f5a72'

const clone = <T,>(value: T): T => structuredClone(value)
const RISK_RANK = { critical: 0, medium: 1, optimal: 2 } as const
const BUY_RANK = { order_today: 0, order_by_date: 1, no_stockout: 2 } as const
/** The API's default `page_size` (apps/api routers/runs.py), so paging in the mock matches production. */
export const DEFAULT_PAGE_SIZE = 25

/** Accent- and case-insensitive, so "acido" finds "Ácido cítrico". */
export const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const STOCK_SORTS = new Set<ProductSort>(['current_stock', 'coverage', 'risk', 'suggested_quantity', 'buy_before'])

const withoutStock = (row: ProductRow): ProductRow => ({
  ...row,
  current_stock: null,
  coverage_weeks: null,
  risk: null,
  stockout_date: null,
  suggested_quantity: null,
  buy_before: null,
})

const sortKey: Record<ProductSort, (p: ProductRow) => string | number> = {
  name: (p) => normalize(p.name),
  abc_class: (p) => p.abc_class,
  typical_demand: (p) => p.typical_demand.expected,
  current_stock: (p) => p.current_stock ?? 0,
  coverage: (p) => p.coverage_weeks?.expected ?? Number.POSITIVE_INFINITY,
  risk: (p) => (p.risk ? RISK_RANK[p.risk] : Number.POSITIVE_INFINITY),
  suggested_quantity: (p) => p.suggested_quantity?.high ?? 0,
  buy_before: (p) => (p.buy_before ? BUY_RANK[p.buy_before.action] * 1e6 + (p.buy_before.date ? Date.parse(p.buy_before.date) / 1e8 : 0) : 0),
  lead_time: (p) => p.lead_time_days,
}

export interface RunMockHooks {
  /** Puts the conversation owning the run back to `calculating` and returns the new job. */
  startRecalculation(runId: string): { job_id: string; conversation_id: string }
  controls: { failRun: boolean }
}

/** The stock run's figures with every stock-dependent field removed, as the API sends them (contract D17-C). */
function createNoStockRun() {
  const rows = (runProducts.items as unknown as ProductRow[]).map(withoutStock)
  const base = runSummary as unknown as RunSummary
  const summary: RunSummary = {
    ...clone(base),
    run: { ...clone(base.run), id: NO_STOCK_RUN_ID, conversation_id: NO_STOCK_CONVERSATION_ID },
    kpis: { ...clone(base.kpis), products_at_risk: null, average_coverage_weeks: null },
    risk_distribution: null,
    stock_known: false,
  }
  const details = Object.fromEntries(
    Object.entries(runDetails as unknown as Record<string, ProductDetail>).map(([code, detail]) => [
      code,
      { ...clone(detail), product: withoutStock(detail.product), purchase: null, without_new_purchase: null, with_suggested_purchase: null },
    ]),
  )
  return { summary, products: new Map(rows.map((row) => [row.code, clone(row)])), details }
}

/** In-memory run service over the generated fixtures. One fixture run backs every run id, except `NO_STOCK_RUN_ID`. */
export function createRunService({ startRecalculation, controls }: RunMockHooks) {
  const noStock = createNoStockRun()
  const products = new Map<string, ProductRow>(
    (runProducts.items as unknown as ProductRow[]).map((p) => [p.code, clone(p)]),
  )
  // What the last calculation produced; overrides are layered on top only when the next one finishes.
  const base = new Map<string, ProductRow>([...products].map(([code, row]) => [code, clone(row)]))
  const overrides = new Map<string, ProductOverrides>()
  const details = runDetails as unknown as Record<string, ProductDetail>
  let summary = clone(runSummary) as unknown as RunSummary
  let parameters: RunParameters = clone(summary.run.parameters)

  const guard = () => {
    if (controls.failRun) throw failure('failure')
  }

  const service: RunService = {
    async summary(runId) {
      guard()
      if (runId === NO_STOCK_RUN_ID) return clone(noStock.summary)
      return clone({ ...summary, run: { ...summary.run, parameters } })
    },
    async products(runId, query: ProductQuery = {}) {
      guard()
      const stockless = runId === NO_STOCK_RUN_ID
      // Like the API: the risk filter cannot be answered without stock; sorts that need it fall back to the name.
      if (stockless && query.risk?.length) throw failure('validation', { status: 422, message_key: 'errors.stockUnknown' })
      const all = stockless ? [...noStock.products.values()] : [...products.values()]
      const q = query.q ? normalize(query.q.trim()) : ''
      const filtered = all.filter(
        (p) =>
          (!q || normalize(p.name).includes(q) || normalize(p.code).includes(q)) &&
          (!query.risk?.length || p.risk !== null && query.risk.includes(p.risk)) &&
          (!query.abc?.length || query.abc.includes(p.abc_class)),
      )
      const key = sortKey[stockless && STOCK_SORTS.has(query.sort ?? 'risk') ? 'name' : (query.sort ?? 'risk')]
      const dir = query.order === 'desc' ? -1 : 1
      filtered.sort((a, b) => {
        const x = key(a)
        const y = key(b)
        const cmp = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y)
        return cmp * dir || normalize(a.name).localeCompare(normalize(b.name))
      })
      const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
      const page = Math.max(1, query.page ?? 1)
      return clone({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        page,
        page_size: pageSize,
        total: filtered.length,
        total_unfiltered: all.length,
      })
    },
    async product(runId, code) {
      guard()
      if (runId === NO_STOCK_RUN_ID) {
        const stockless = noStock.details[code]
        if (!stockless) throw failure('not_found')
        return clone(stockless)
      }
      const detail = details[code]
      const row = products.get(code)
      if (!detail || !row) throw failure('not_found')
      return clone({ ...detail, product: row })
    },
    async simulate(runId, code, request) {
      guard()
      if (runId === NO_STOCK_RUN_ID) throw failure('validation', { status: 409, message_key: 'errors.stockUnknown' })
      const detail = details[code]
      const row = products.get(code)
      if (!detail?.purchase || !detail.without_new_purchase || !detail.with_suggested_purchase || !row) throw failure('not_found')
      const leadTime = request.lead_time_days ?? row.lead_time_days
      const target = request.target_coverage_weeks ?? row.target_coverage_weeks
      const projection = request.with_purchase ? detail.with_suggested_purchase : detail.without_new_purchase
      return clone({
        product: { ...row, lead_time_days: leadTime, target_coverage_weeks: target },
        purchase: { ...detail.purchase, lead_time_days: leadTime, target_coverage_weeks: target },
        projection,
      })
    },
    async updateParameters(_runId, next) {
      guard()
      parameters = clone(next)
      summary = { ...summary, run: { ...summary.run, parameters_pending: true } }
      return clone(parameters)
    },
    async recalculate(runId) {
      guard()
      return startRecalculation(runId)
    },
    /**
     * Like the API (`PUT /v1/products/{code}/overrides`): the body REPLACES the product's overrides (an empty
     * body clears them) and nothing shown changes until the next calculation finishes.
     */
    async setOverrides(code, body) {
      guard()
      if (!products.has(code)) throw failure('not_found')
      const kept = Object.fromEntries(Object.entries(body).filter(([, value]) => value != null))
      if (Object.keys(kept).length === 0) overrides.delete(code)
      else overrides.set(code, kept)
      return clone(body)
    },
    async createExport(_runId, request) {
      guard()
      const scope = request.scope === 'product' ? (request.codes?.[0] ?? 'producto') : request.scope === 'selection' ? 'seleccion' : 'todos'
      return {
        file_name: `pronostico-${scope}.xlsx`,
        download_url: 'https://storage.example.invalid/object/sign/exports/mock?token=mock',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        format: 'xlsx',
      }
    },
  }

  /** Called when a calculation finishes: rebuilds every row from the base figures plus the stored overrides. */
  function applyStoredOverrides() {
    for (const [code, row] of products) {
      const stored = overrides.get(code)
      const original = base.get(code)!
      Object.assign(row, clone(original))
      if (stored?.lead_time_days != null) {
        row.lead_time_days = stored.lead_time_days
        row.lead_time_overridden = true
      }
      if (stored?.target_coverage_weeks != null) row.target_coverage_weeks = stored.target_coverage_weeks
      if (stored?.on_order_quantity != null) row.on_order_quantity = stored.on_order_quantity
    }
    summary = { ...summary, run: { ...summary.run, parameters_pending: false, stale: false, defaults_used: [] } }
  }

  return Object.assign(service, { applyStoredOverrides })
}

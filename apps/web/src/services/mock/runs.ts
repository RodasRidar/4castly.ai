import runProducts from './fixtures/run-products.json'
import runDetails from './fixtures/run-product-details.json'
import runSummary from './fixtures/run-summary.json'
import { failure } from './errors'
import type { ProductQuery, RunService } from '../ports'
import type { ProductDetail, ProductRow, ProductSort, RunParameters, RunSummary } from '../types'

const clone = <T,>(value: T): T => structuredClone(value)
const RISK_RANK = { critical: 0, medium: 1, optimal: 2 } as const
const BUY_RANK = { order_today: 0, order_by_date: 1, no_stockout: 2 } as const
export const DEFAULT_PAGE_SIZE = 20

/** Accent- and case-insensitive, so "acido" finds "Ácido cítrico". */
export const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const sortKey: Record<ProductSort, (p: ProductRow) => string | number> = {
  name: (p) => normalize(p.name),
  abc_class: (p) => p.abc_class,
  typical_demand: (p) => p.typical_demand.expected,
  current_stock: (p) => p.current_stock,
  coverage: (p) => p.coverage_weeks.expected ?? Number.POSITIVE_INFINITY,
  risk: (p) => RISK_RANK[p.risk],
  suggested_quantity: (p) => p.suggested_quantity.high,
  buy_before: (p) => BUY_RANK[p.buy_before.action] * 1e6 + (p.buy_before.date ? Date.parse(p.buy_before.date) / 1e8 : 0),
  lead_time: (p) => p.lead_time_days,
}

export interface RunMockHooks {
  /** Puts the conversation owning the run back to `calculating` and returns the new job. */
  startRecalculation(runId: string): { job_id: string; conversation_id: string }
  controls: { failRun: boolean }
}

/** In-memory run service over the generated fixtures. One fixture run backs every run id. */
export function createRunService({ startRecalculation, controls }: RunMockHooks) {
  const products = new Map<string, ProductRow>(
    (runProducts.items as unknown as ProductRow[]).map((p) => [p.code, clone(p)]),
  )
  const details = runDetails as unknown as Record<string, ProductDetail>
  let summary = clone(runSummary) as unknown as RunSummary
  let parameters: RunParameters = clone(summary.run.parameters)

  const guard = () => {
    if (controls.failRun) throw failure('failure')
  }

  const service: RunService = {
    async summary() {
      guard()
      return clone({ ...summary, run: { ...summary.run, parameters } })
    },
    async products(_runId, query: ProductQuery = {}) {
      guard()
      const all = [...products.values()]
      const q = query.q ? normalize(query.q.trim()) : ''
      const filtered = all.filter(
        (p) =>
          (!q || normalize(p.name).includes(q) || normalize(p.code).includes(q)) &&
          (!query.risk?.length || query.risk.includes(p.risk)) &&
          (!query.abc?.length || query.abc.includes(p.abc_class)),
      )
      const key = sortKey[query.sort ?? 'risk']
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
    async product(_runId, code) {
      guard()
      const detail = details[code]
      const row = products.get(code)
      if (!detail || !row) throw failure('not_found')
      return clone({ ...detail, product: row })
    },
    async simulate(_runId, code, request) {
      guard()
      const detail = details[code]
      const row = products.get(code)
      if (!detail || !row) throw failure('not_found')
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
      summary = { ...summary, run: { ...summary.run, stale: true } }
      return clone(parameters)
    },
    async recalculate(runId) {
      guard()
      summary = { ...summary, run: { ...summary.run, stale: false, defaults_used: [] } }
      return startRecalculation(runId)
    },
    async setOverrides(code, overrides) {
      guard()
      const row = products.get(code)
      if (!row) throw failure('not_found')
      if (overrides.lead_time_days != null) {
        row.lead_time_days = overrides.lead_time_days
        row.lead_time_overridden = true
      }
      if (overrides.target_coverage_weeks != null) row.target_coverage_weeks = overrides.target_coverage_weeks
      if (overrides.on_order_quantity != null) row.on_order_quantity = overrides.on_order_quantity
      return clone(overrides)
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
  return service
}

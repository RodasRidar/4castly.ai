import type { RunService } from '../ports'
import type {
  ExportFile,
  JobAccepted,
  ProductDetail,
  ProductOverrides,
  ProductPage,
  RunParameters,
  RunSummary,
  SimulationResult,
} from '../types'
import type { HttpClient } from './client'

const part = encodeURIComponent

/** Results, portfolio table, product detail, what-if, parameters and exports (apps/api `/v1/runs`). */
export function createHttpRunService(client: HttpClient): RunService {
  return {
    summary: (runId) => client.json<RunSummary>('GET', `/v1/runs/${part(runId)}/summary`),

    products: (runId, query = {}) =>
      client.json<ProductPage>('GET', `/v1/runs/${part(runId)}/products`, {
        query: {
          q: query.q?.trim() || undefined,
          risk: query.risk,
          abc: query.abc,
          sort: query.sort,
          order: query.order,
          page: query.page,
          page_size: query.pageSize,
        },
      }),

    product: (runId, code) => client.json<ProductDetail>('GET', `/v1/runs/${part(runId)}/products/${part(code)}`),

    simulate: (runId, code, request) =>
      client.json<SimulationResult>('POST', `/v1/runs/${part(runId)}/products/${part(code)}/simulate`, { body: request }),

    updateParameters: (runId, parameters) =>
      client.json<RunParameters>('PUT', `/v1/runs/${part(runId)}/parameters`, { body: parameters }),

    recalculate: (runId) => client.json<JobAccepted>('POST', `/v1/runs/${part(runId)}/recalculate`),

    setOverrides: (code, overrides) =>
      client.json<ProductOverrides>('PUT', `/v1/products/${part(code)}/overrides`, { body: overrides }),

    createExport: (runId, request) => client.json<ExportFile>('POST', `/v1/runs/${part(runId)}/exports`, { body: request }),
  }
}

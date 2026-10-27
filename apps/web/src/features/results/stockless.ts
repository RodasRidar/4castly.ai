import type { ProductSort } from '../../services/types'
import type { ResultsState } from '../shared/resultsUrl'
import type { ProductColumnId } from '../../ui/organisms/ProductTable'

/** Everything that needs stock to mean anything; the API answers these sorts by name when stock is unknown. */
const STOCK_SORTS: ProductSort[] = ['current_stock', 'coverage', 'risk', 'suggested_quantity', 'buy_before']

/** Columns that cannot be shown for a file without stock (D17-C). */
export const STOCK_COLUMNS: ProductColumnId[] = ['stock', 'coverage', 'risk', 'suggested', 'buyBefore']

/** The risk filter would be a 422 and those sorts mean nothing: drop the first and sort by name instead of the rest. */
export function withoutStockDependence<T extends Pick<ResultsState, 'risk' | 'sort' | 'order'>>(state: T): T {
  if (state.risk.length === 0 && !STOCK_SORTS.includes(state.sort)) return state
  return { ...state, risk: [], ...(STOCK_SORTS.includes(state.sort) ? { sort: 'name' as const, order: 'asc' as const } : {}) }
}

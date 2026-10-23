import { useTranslation } from 'react-i18next'
import type { ProductProjection as Projection, ProductRow } from '../../services/types'
import { ProductForecastChart } from '../../ui/organisms/ProductForecastChart'
import { WeeklyProjectionTable } from '../../ui/organisms/WeeklyProjectionTable'
import { firstFutureStockout, pastStockoutDates, toChartPoints, toTableRows } from './productModel'
import { useFormatters } from './useFormatters'

interface ProductProjectionProps {
  product: ProductRow
  projection: Projection
  today: string
  withPurchase: boolean
  onWithPurchaseChange: (value: boolean) => void
}

/** Chart and weekly table for the chosen scenario. Numbers are the contract's; this only arranges and labels them. */
export function ProductProjection({ product, projection, today, withPurchase, onWithPurchaseChange }: ProductProjectionProps) {
  const { t } = useTranslation()
  const { shortDate } = useFormatters()

  const points = toChartPoints(projection.series, shortDate)
  const rows = toTableRows(projection.weekly, {
    in_stock: t('product.table.status.in_stock'),
    arrival: t('product.table.status.arrival'),
    stockout: t('product.table.status.stockout'),
  })
  const arrival = projection.arrivals.find((a) => a.quantity > 0)
  const projectedStockout = firstFutureStockout(projection.stockout_zones, today)

  return (
    <div className="flex flex-col gap-6">
      <ProductForecastChart
        state={points.length > 0 ? 'populated' : 'empty'}
        label={t('product.chart.label', { name: product.name })}
        points={points}
        todayDate={today}
        stockoutDates={pastStockoutDates(projection.series, projection.stockout_zones, today)}
        projectedStockoutDate={projectedStockout ?? undefined}
        arrivalDate={arrival?.date}
        legend={{
          history: t('product.chart.history'),
          expected: t('product.chart.expected'),
          range: t('product.chart.range'),
          stockout: t('product.chart.stockout'),
          today: t('product.chart.today'),
          stock: t('product.chart.stock'),
          arrival: t('product.chart.arrival'),
          projectedStockout: t('product.chart.projectedStockout'),
        }}
        table={{
          caption: t('product.chart.tableCaption', { name: product.name }),
          toggleLabel: t('product.chart.tableToggle'),
          columns: {
            date: t('product.chart.columns.date'),
            history: t('product.chart.columns.history'),
            expected: t('product.chart.columns.expected'),
            low: t('product.chart.columns.low'),
            high: t('product.chart.columns.high'),
            stock: t('product.chart.columns.stock'),
          },
        }}
        loadingLabel={t('product.loading')}
        empty={{ title: t('product.chart.emptyTitle'), body: t('product.chart.emptyBody') }}
        error={{ title: t('product.errorTitle'), body: t('product.errorBody') }}
        demandAxisLabel={t('product.chart.demandAxis', { unit: product.uom })}
        stockAxisLabel={t('product.chart.stockAxis', { unit: product.uom })}
      />
      <WeeklyProjectionTable
        state={rows.length > 0 ? 'populated' : 'empty'}
        caption={t('product.table.caption', { name: product.name })}
        columns={{
          week: t('product.table.columns.week'),
          low: t('product.table.columns.low'),
          expected: t('product.table.columns.expected'),
          high: t('product.table.columns.high'),
          stock: t('product.table.columns.stock'),
          shortfall: t('product.table.columns.shortfall'),
          status: t('product.table.columns.status'),
        }}
        unit={product.uom}
        rows={rows}
        scenario={{
          label: t('product.scenario.label'),
          value: withPurchase ? 'with' : 'without',
          onValueChange: (value) => onWithPurchaseChange(value === 'with'),
          options: [
            { value: 'without', label: t('product.scenario.without') },
            { value: 'with', label: t('product.scenario.with') },
          ],
        }}
        loadingLabel={t('product.loading')}
        empty={{ title: t('product.table.emptyTitle'), body: t('product.table.emptyBody') }}
        error={{ title: t('product.errorTitle'), body: t('product.errorBody') }}
      />
    </div>
  )
}

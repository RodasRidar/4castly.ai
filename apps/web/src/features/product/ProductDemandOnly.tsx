import { useTranslation } from 'react-i18next'
import type { ProductDetail } from '../../services/types'
import { ReliabilityCard } from '../../ui/organisms/ProductSummaryCards'
import { WeeklyDemandTable } from '../../ui/organisms/WeeklyDemandTable'
import { ForecastChart } from '../../ui/organisms/ForecastChart'
import { nearestPointDate, stockoutDates } from '../results/format'
import { useExportProduct } from './useProductData'
import { ProductAsk } from './ProductAsk'
import { ProductHeader } from './ProductHeader'
import { ReliabilityDetails } from './ReliabilityDetails'
import { toChartPoints } from './productModel'
import { useFormatters } from './useFormatters'
import { useProductParams } from './useProductParams'

interface ProductDemandOnlyProps {
  detail: ProductDetail
  conversationId: string
  runId: string
}

/** The page for a file without stock: reliability, the forecast with its range and demand per week. No purchase, no what-if. */
export function ProductDemandOnly({ detail, conversationId, runId }: ProductDemandOnlyProps) {
  const { t } = useTranslation()
  const { shortDate } = useFormatters()
  const { asking, setAsking } = useProductParams()
  const { product, forecast, reliability } = detail
  const exportProduct = useExportProduct(runId, product.code)

  const points = toChartPoints(forecast.series, shortDate)
  const rows = forecast.weekly.map((w) => ({
    weekStart: new Date(w.week_start),
    low: w.demand.low,
    expected: w.demand.expected,
    high: w.demand.high,
  }))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <ProductHeader
        detail={detail}
        conversationId={conversationId}
        exporting={exportProduct.isPending}
        onExport={() => exportProduct.mutate()}
        onAsk={() => setAsking(true)}
      />
      <div className="max-w-md">
        <ReliabilityCard
          headingLevel={2}
          reliability={{
            title: t('product.reliability.title'),
            level: reliability.level,
            badgeLabel: t(`product.reliability.level.${reliability.level}`),
            explanation: t(`product.reliability.explanation.${reliability.level}`),
            detailToggleLabel: t('product.reliability.detailToggle'),
            detail: <ReliabilityDetails reliability={reliability} />,
          }}
        />
      </div>
      <ForecastChart
        state={points.length > 0 ? 'populated' : 'empty'}
        label={t('product.noStock.chartLabel', { name: product.name })}
        points={points}
        todayDate={nearestPointDate(forecast.series.map((p) => p.date), detail.today)}
        stockoutDates={stockoutDates(forecast.series)}
        legend={{
          history: t('product.chart.history'),
          expected: t('product.chart.expected'),
          range: t('product.chart.range'),
          stockout: t('product.chart.stockout'),
          today: t('product.chart.today'),
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
          },
        }}
        loadingLabel={t('product.loading')}
        empty={{ title: t('product.chart.emptyTitle'), body: t('product.chart.emptyBody') }}
        error={{ title: t('product.errorTitle'), body: t('product.errorBody') }}
        axisLabel={t('product.chart.demandAxis', { unit: product.uom })}
      />
      <WeeklyDemandTable
        caption={t('product.noStock.tableCaption', { name: product.name })}
        columns={{
          week: t('product.table.columns.week'),
          low: t('product.table.columns.low'),
          expected: t('product.table.columns.expected'),
          high: t('product.table.columns.high'),
        }}
        unit={product.uom}
        rows={rows}
        empty={{ title: t('product.table.emptyTitle'), body: t('product.table.emptyBody') }}
      />
      <ProductAsk open={asking} onOpenChange={setAsking} conversationId={conversationId} productCode={product.code} productName={product.name} />
    </div>
  )
}

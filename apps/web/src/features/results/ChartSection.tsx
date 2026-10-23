import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/atoms/Button'
import { FilterSelect } from '../../ui/molecules/FilterSelect'
import { ForecastChart } from '../../ui/organisms/ForecastChart'
import { nearestPointDate, stockoutDates, toChartPoints } from './format'
import { useRunSummary } from './queries'

interface ChartSectionProps {
  runId: string
  onRetry: () => void
}

/** Aggregate demand of the whole run, one chart per unit of measure (units are never added together). */
export function ChartSection({ runId, onRetry }: ChartSectionProps) {
  const { t, i18n } = useTranslation()
  const summary = useRunSummary(runId)
  const [chosen, setChosen] = useState<string | null>(null)

  const series = summary.data?.series_by_uom ?? []
  const units = series.map((s) => s.uom).sort(new Intl.Collator(i18n.language).compare)
  const unit = chosen && units.includes(chosen) ? chosen : units[0]
  const selected = series.find((s) => s.uom === unit)
  const monthly = summary.data?.run.parameters.granularity === 'monthly'
  const points = selected ? toChartPoints(selected.points, i18n.language) : []

  return (
    <section className="flex flex-col gap-3">
      {units.length > 1 && (
        <FilterSelect
          label={t('results.chart.unit')}
          options={units.map((u) => ({ value: u, label: u }))}
          value={unit}
          onValueChange={setChosen}
        />
      )}
      <ForecastChart
        state={summary.isPending ? 'loading' : summary.isError ? 'error' : points.length === 0 ? 'empty' : 'populated'}
        label={t(monthly ? 'results.chart.labelMonthly' : 'results.chart.labelWeekly', { unit })}
        points={points}
        todayDate={summary.data && selected ? nearestPointDate(selected.points.map((p) => p.date), summary.data.today) : undefined}
        stockoutDates={selected ? stockoutDates(selected.points) : []}
        legend={{
          history: t('results.chart.legend.history'),
          expected: t('results.chart.legend.expected'),
          range: t('results.chart.legend.range'),
          stockout: t('results.chart.legend.stockout'),
          today: t('results.chart.legend.today'),
        }}
        table={{
          caption: t('results.chart.table.caption', { unit }),
          toggleLabel: t('results.chart.table.toggle'),
          columns: {
            date: t('results.chart.table.columns.date'),
            history: t('results.chart.table.columns.history'),
            expected: t('results.chart.table.columns.expected'),
            low: t('results.chart.table.columns.low'),
            high: t('results.chart.table.columns.high'),
          },
        }}
        loadingLabel={t('results.chart.loading')}
        empty={{ title: t('results.chart.emptyTitle'), body: t('results.chart.emptyBody') }}
        error={{
          title: t('results.chart.errorTitle'),
          body: t('results.chart.errorBody'),
          action: <Button variant="secondary" onClick={onRetry}>{t('results.chart.retry')}</Button>,
        }}
        axisLabel={t(monthly ? 'results.chart.axisMonthly' : 'results.chart.axisWeekly', { unit })}
      />
    </section>
  )
}

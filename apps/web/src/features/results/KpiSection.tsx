import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { Button } from '../../ui/atoms/Button'
import { KpiRow, type KpiRowItem } from '../../ui/organisms/KpiRow'
import type { FilterLink } from '../../services/types'
import { resultsSearch, type ResultsState } from '../shared/resultsUrl'
import { useRunSummary } from './queries'

interface KpiSectionProps {
  runId: string
  state: ResultsState
  onRetry: () => void
}

/** The KPIs describe the whole run: the summary endpoint has no filter parameters (contract request). */
export function KpiSection({ runId, state, onRetry }: KpiSectionProps) {
  const { t, i18n } = useTranslation()
  const { pathname } = useLocation()
  const summary = useRunSummary(runId)
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 })

  const hrefFor = (link: FilterLink) =>
    `${pathname}${resultsSearch({
      ...state,
      q: link.q ?? '',
      risk: link.risk ? [link.risk] : [],
      abc: link.abc ? [link.abc] : [],
      page: 1,
    })}`

  let items: KpiRowItem[] = []
  if (summary.data) {
    const { kpis, total_products } = summary.data
    const { lower, expected, upper } = kpis.average_coverage_weeks
    const { overall, distribution } = kpis.reliability
    items = [
      {
        id: 'at-risk',
        label: t('results.kpi.atRisk'),
        value: kpis.products_at_risk.count,
        caption: t('results.kpi.atRiskCaption', { count: total_products, total: total_products }),
        linkLabel: t('results.kpi.atRiskLink'),
        href: hrefFor(kpis.products_at_risk),
      },
      {
        id: 'coverage',
        label: t('results.kpi.coverage'),
        value: expected === null ? undefined : t('results.kpi.coverageValue', { value: number.format(expected) }),
        caption:
          lower === null || upper === null
            ? undefined
            : t('results.kpi.coverageRange', { lower: number.format(lower), upper: number.format(upper) }),
      },
      {
        id: 'reliability',
        label: t('results.kpi.reliability'),
        value: t(`results.kpi.levels.${overall}`),
        caption: t('results.kpi.reliabilityCaption', distribution),
      },
    ]
  }

  return (
    <KpiRow
      state={summary.isPending ? 'loading' : summary.isError ? 'error' : 'populated'}
      items={items}
      label={t('results.kpi.label')}
      loadingLabel={t('results.kpi.loading')}
      error={{
        title: t('results.kpi.errorTitle'),
        body: t('results.kpi.errorBody'),
        action: <Button variant="secondary" onClick={onRetry}>{t('results.kpi.retry')}</Button>,
      }}
    />
  )
}

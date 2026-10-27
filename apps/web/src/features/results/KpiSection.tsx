import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { Button } from '../../ui/atoms/Button'
import { KpiRow, type KpiRowItem } from '../../ui/organisms/KpiRow'
import type { FilterLink, RunKpis } from '../../services/types'
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

  const stockItems = (
    atRisk: NonNullable<RunKpis['products_at_risk']>,
    coverage: NonNullable<RunKpis['average_coverage_weeks']>,
    total: number,
  ): KpiRowItem[] => [
      {
        id: 'at-risk',
        label: t('results.kpi.atRisk'),
        value: atRisk.count,
        caption: t('results.kpi.atRiskCaption', { count: total, total }),
        linkLabel: t('results.kpi.atRiskLink'),
        href: hrefFor(atRisk),
      },
      {
        id: 'coverage',
        label: t('results.kpi.coverage'),
        value: coverage.expected === null ? undefined : t('results.kpi.coverageValue', { value: number.format(coverage.expected) }),
        caption:
          coverage.lower === null || coverage.upper === null
            ? undefined
            : t('results.kpi.coverageRange', { lower: number.format(coverage.lower), upper: number.format(coverage.upper) }),
      },
  ]

  let items: KpiRowItem[] = []
  if (summary.data) {
    const { kpis, total_products: total } = summary.data
    const { overall, distribution } = kpis.reliability
    const atRisk = kpis.products_at_risk
    const coverage = kpis.average_coverage_weeks
    items = [
      // Without stock there is no risk and no coverage: the API sends both as null (D17-C).
      ...(atRisk && coverage ? stockItems(atRisk, coverage, total) : []),
      {
        id: 'reliability',
        label: t('results.kpi.reliability'),
        value: t(`results.kpi.levels.${overall}`),
        caption: t('results.kpi.reliabilityCaption', distribution),
      },
    ]
  }

  return (
    <>
      {/* Gives the KPI cards (h3) a parent heading under the page h1, so levels never skip. */}
      <h2 className="sr-only">{t('results.kpi.label')}</h2>
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
    </>
  )
}

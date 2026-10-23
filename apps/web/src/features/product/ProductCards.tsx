import { useTranslation } from 'react-i18next'
import type { ProductDetail, ProductRow, PurchaseRecommendation } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { ProductSummaryCards } from '../../ui/organisms/ProductSummaryCards'
import { ReliabilityDetails } from './ReliabilityDetails'
import { useFormatters } from './useFormatters'

interface ProductCardsProps {
  product: ProductRow
  purchase: PurchaseRecommendation
  reliability: ProductDetail['reliability']
  leadTime: number
  coverage: number
  onLeadTime: (value: number) => void
  onCoverage: (value: number) => void
  /** A what-if is being calculated. */
  updating: boolean
  updateError: string | null
  canSave: boolean
  saving: boolean
  onSave: () => void
}

/** The three summary cards plus the plain-language notes that go with the purchase recommendation. */
export function ProductCards({
  product,
  purchase,
  reliability,
  leadTime,
  coverage,
  onLeadTime,
  onCoverage,
  updating,
  updateError,
  canSave,
  saving,
  onSave,
}: ProductCardsProps) {
  const { t } = useTranslation()
  const { number } = useFormatters()
  const action = purchase.buy_before.action
  const noRisk = action === 'no_stockout'
  const buyBefore = purchase.buy_before.date ?? purchase.buy_before.earliest_date
  const weeksWithoutStock = purchase.buy_before.weeks_without_stock
  const { low, high } = purchase.suggested_quantity

  return (
    <div className="flex flex-col gap-3">
      <ProductSummaryCards
        headingLevel={2}
        state={noRisk ? 'no-risk' : 'populated'}
        loadingLabel={t('product.loading')}
        stockout={{
          title: t('product.stockout.title'),
          date: product.stockout_date ? new Date(product.stockout_date) : null,
          description: t('product.stockout.description'),
          noRiskTitle: t('product.stockout.noRiskTitle'),
          noRiskBody: t('product.stockout.noRiskBody'),
        }}
        purchase={{
          title: t('product.purchase.title'),
          quantityLabel: t('product.purchase.quantity'),
          quantity: high,
          quantityUnit: product.uom,
          buyBeforeLabel: t('product.purchase.buyBefore'),
          buyBefore: buyBefore ? new Date(buyBefore) : null,
          noPurchaseText: t('product.purchase.noPurchase'),
          leadTime: {
            label: t('product.purchase.leadTime'),
            value: leadTime,
            unit: t('product.purchase.leadTimeUnit'),
            min: 1,
            max: 365,
            onChange: onLeadTime,
            decrementLabel: t('product.purchase.leadTimeDecrease'),
            incrementLabel: t('product.purchase.leadTimeIncrease'),
          },
          coverage: {
            label: t('product.purchase.coverage'),
            value: coverage,
            unit: t('product.purchase.coverageUnit'),
            min: 1,
            max: 52,
            onChange: onCoverage,
            decrementLabel: t('product.purchase.coverageDecrease'),
            incrementLabel: t('product.purchase.coverageIncrease'),
          },
        }}
        reliability={{
          title: t('product.reliability.title'),
          level: reliability.level,
          badgeLabel: t(`product.reliability.level.${reliability.level}`),
          explanation: t(`product.reliability.explanation.${reliability.level}`),
          detailToggleLabel: t('product.reliability.detailToggle'),
          detail: <ReliabilityDetails reliability={reliability} />,
        }}
      />
      <div className="flex flex-col gap-2 text-body-md text-body">
        <p>{t(`product.purchase.action.${action}`)}</p>
        {action === 'order_today' && weeksWithoutStock > 0 && (
          <p>{t('product.purchase.weeksWithoutStock', { weeks: number(Math.round(weeksWithoutStock)) })}</p>
        )}
        {!noRisk && (
          <p className="text-mute">{t('product.purchase.range', { low: number(low), high: number(high), unit: product.uom })}</p>
        )}
        {purchase.truncated && <InlineNotice tone="warning">{t('product.purchase.truncated')}</InlineNotice>}
        {updateError && <InlineNotice tone="warning">{updateError}</InlineNotice>}
        {updating && (
          <p role="status" className="text-mute">
            {t('product.purchase.updating')}
          </p>
        )}
        {canSave && (
          <div>
            <Button variant="secondary" size="sm" loading={saving} onClick={onSave}>
              {t('product.purchase.save')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductDetail, ProductProjection as Projection, PurchaseRecommendation } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { usePendingLeadTimes } from '../results/pendingOverrides'
import { useRecalculate } from '../results/useRecalculate'
import { ProductAsk } from './ProductAsk'
import { ProductCards } from './ProductCards'
import { ProductHeader } from './ProductHeader'
import { ProductDemandOnly } from './ProductDemandOnly'
import { ProductProjection } from './ProductProjection'
import { errorRef } from './errorRef'
import { useDebouncedValue, useExportProduct, useSaveLeadTime, useSimulation } from './useProductData'
import { useProductParams } from './useProductParams'

interface ProductDetailViewProps {
  detail: ProductDetail
  conversationId: string
  runId: string
}

/**
 * The loaded page. A file without stock has no purchase and no projections (D17-C): only demand and reliability.
 */
export function ProductDetailView({ detail, conversationId, runId }: ProductDetailViewProps) {
  const { purchase, without_new_purchase: without, with_suggested_purchase: withSuggested } = detail
  if (!purchase || !without || !withSuggested) return <ProductDemandOnly detail={detail} conversationId={conversationId} runId={runId} />
  return <ProductStockView detail={detail} stock={{ purchase, without, withSuggested }} conversationId={conversationId} runId={runId} />
}

interface StockViewProps extends ProductDetailViewProps {
  stock: { purchase: PurchaseRecommendation; without: Projection; withSuggested: Projection }
}

/**
 * The page with stock. It owns the what-if inputs: they start from the product's saved lead time and coverage, and as
 * soon as they differ from what the recommendation was calculated with, the API simulates the new proposal.
 * Mounted with `key={code}` so moving to another product starts from that product's values.
 */
function ProductStockView({ detail, stock, conversationId, runId }: StockViewProps) {
  const { t } = useTranslation()
  const { product } = detail
  const { withPurchase, setWithPurchase, asking, setAsking } = useProductParams()

  // A lead time saved earlier is only applied on the next calculation: until then the saved value is the pending one.
  const savedLeadTime = usePendingLeadTimes(runId)[product.code] ?? product.lead_time_days
  const [leadTime, setLeadTime] = useState(savedLeadTime)
  const [coverage, setCoverage] = useState(product.target_coverage_weeks)
  const settledLeadTime = useDebouncedValue(leadTime)
  const settledCoverage = useDebouncedValue(coverage)

  const edited = settledLeadTime !== stock.purchase.lead_time_days || settledCoverage !== stock.purchase.target_coverage_weeks
  const simulation = useSimulation(
    runId,
    product.code,
    { lead_time_days: settledLeadTime, target_coverage_weeks: settledCoverage, with_purchase: withPurchase },
    edited,
  )
  const simulated = edited ? simulation.data : undefined
  const updating = (edited && simulation.isFetching) || leadTime !== settledLeadTime || coverage !== settledCoverage

  const purchase = simulated?.purchase ?? stock.purchase
  const shownProduct = simulated?.product ?? product
  const projection = simulated?.projection ?? (withPurchase ? stock.withSuggested : stock.without)

  const save = useSaveLeadTime(runId, product.code, product.name)
  const exportProduct = useExportProduct(runId, product.code)
  const recalculate = useRecalculate(runId, conversationId)
  const waiting = product.code in usePendingLeadTimes(runId)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <ProductHeader
        detail={detail}
        conversationId={conversationId}
        exporting={exportProduct.isPending}
        onExport={() => exportProduct.mutate()}
        onAsk={() => setAsking(true)}
      />
      <ProductCards
        product={shownProduct}
        purchase={purchase}
        reliability={detail.reliability}
        leadTime={leadTime}
        coverage={coverage}
        onLeadTime={setLeadTime}
        onCoverage={setCoverage}
        updating={updating}
        updateError={simulation.isError ? t('product.purchase.updateError', { ref: errorRef(simulation.error) }) : null}
        canSave={leadTime !== savedLeadTime}
        saving={save.isPending}
        onSave={() => save.mutate(leadTime)}
      />
      {waiting && (
        <InlineNotice tone="staleness">
          <span className="flex flex-wrap items-center gap-3">
            <span>{t('product.purchase.pendingNotice')}</span>
            <Button variant="secondary" size="sm" loading={recalculate.isPending} onClick={() => recalculate.mutate()}>
              {t('product.purchase.recalculate')}
            </Button>
          </span>
        </InlineNotice>
      )}
      <ProductProjection
        product={shownProduct}
        projection={projection}
        today={detail.today}
        withPurchase={withPurchase}
        onWithPurchaseChange={setWithPurchase}
      />
      <ProductAsk open={asking} onOpenChange={setAsking} conversationId={conversationId} productCode={product.code} productName={product.name} />
    </div>
  )
}

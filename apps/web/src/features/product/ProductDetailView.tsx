import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ProductDetail } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { InlineNotice } from '../../ui/molecules/InlineNotice'
import { usePendingLeadTimes } from '../results/pendingOverrides'
import { useRecalculate } from '../results/useRecalculate'
import { ProductAsk } from './ProductAsk'
import { ProductCards } from './ProductCards'
import { ProductHeader } from './ProductHeader'
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
 * The loaded page. It owns the what-if inputs: they start from the product's saved lead time and coverage, and as
 * soon as they differ from what the recommendation was calculated with, the API simulates the new proposal.
 * Mounted with `key={code}` so moving to another product starts from that product's values.
 */
export function ProductDetailView({ detail, conversationId, runId }: ProductDetailViewProps) {
  const { t } = useTranslation()
  const { product } = detail
  const { withPurchase, setWithPurchase, asking, setAsking } = useProductParams()

  // A lead time saved earlier is only applied on the next calculation: until then the saved value is the pending one.
  const savedLeadTime = usePendingLeadTimes(runId)[product.code] ?? product.lead_time_days
  const [leadTime, setLeadTime] = useState(savedLeadTime)
  const [coverage, setCoverage] = useState(product.target_coverage_weeks)
  const settledLeadTime = useDebouncedValue(leadTime)
  const settledCoverage = useDebouncedValue(coverage)

  const edited = settledLeadTime !== detail.purchase.lead_time_days || settledCoverage !== detail.purchase.target_coverage_weeks
  const simulation = useSimulation(
    runId,
    product.code,
    { lead_time_days: settledLeadTime, target_coverage_weeks: settledCoverage, with_purchase: withPurchase },
    edited,
  )
  const simulated = edited ? simulation.data : undefined
  const updating = (edited && simulation.isFetching) || leadTime !== settledLeadTime || coverage !== settledCoverage

  const purchase = simulated?.purchase ?? detail.purchase
  const shownProduct = simulated?.product ?? product
  const projection = simulated?.projection ?? (withPurchase ? detail.with_suggested_purchase : detail.without_new_purchase)

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

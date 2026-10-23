import { PackageSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/atoms/Button'
import { Skeleton } from '../../ui/atoms/Skeleton'
import { Spinner } from '../../ui/atoms/Spinner'
import { EmptyState } from '../../ui/molecules/EmptyState'
import { ErrorState } from '../../ui/molecules/ErrorState'
import { ProductSummaryCards } from '../../ui/organisms/ProductSummaryCards'

const frame = 'mx-auto flex w-full max-w-6xl flex-col gap-6 p-6'

/** Skeleton of the whole page while the product loads. */
export function ProductLoading() {
  const { t } = useTranslation()
  return (
    <div className={frame}>
      <Spinner label={t('product.loading')} />
      <Skeleton className="h-8 w-1/3" />
      <ProductSummaryCards
        state="loading"
        loadingLabel={t('product.loading')}
        stockout={{ title: t('product.stockout.title'), date: null, description: '', noRiskTitle: '', noRiskBody: '' }}
        purchase={{
          title: t('product.purchase.title'),
          quantityLabel: '',
          quantity: null,
          quantityUnit: '',
          buyBeforeLabel: '',
          buyBefore: null,
          noPurchaseText: '',
          leadTime: { label: '', value: 0, unit: '', onChange: () => {}, decrementLabel: '', incrementLabel: '' },
          coverage: { label: '', value: 0, unit: '', onChange: () => {}, decrementLabel: '', incrementLabel: '' },
        }}
        reliability={{ title: t('product.reliability.title'), level: 'medium', badgeLabel: '', explanation: '', detailToggleLabel: '', detail: null }}
      />
      <Skeleton shape="block" className="h-72" />
    </div>
  )
}

export function ProductError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6">
      <ErrorState
        title={t('product.errorTitle')}
        body={t('product.errorBody')}
        primaryAction={<Button onClick={onRetry}>{t('common.retry')}</Button>}
      />
    </div>
  )
}

export function ProductNotFound({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6">
      <EmptyState
        icon={PackageSearch}
        title={t('product.notFoundTitle')}
        body={t('product.notFoundBody')}
        action={
          <a href={`/c/${conversationId}`} className="text-ink underline underline-offset-[3px]">
            {t('product.notFoundAction')}
          </a>
        }
      />
    </div>
  )
}

export function ProductNotReady({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[50dvh] items-center justify-center p-6">
      <EmptyState
        icon={PackageSearch}
        title={t('product.notReadyTitle')}
        body={t('product.notReadyBody')}
        action={
          <a href={`/c/${conversationId}`} className="text-ink underline underline-offset-[3px]">
            {t('product.notFoundAction')}
          </a>
        }
      />
    </div>
  )
}

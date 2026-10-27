import { ArrowLeft, Download, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import type { ProductDetail } from '../../services/types'
import { Badge } from '../../ui/atoms/Badge'
import { Button } from '../../ui/atoms/Button'
import { Icon } from '../../ui/atoms/Icon'
import { RiskBadge } from '../../ui/molecules/RiskBadge'
import { useFormatters } from './useFormatters'

interface ProductHeaderProps {
  detail: ProductDetail
  conversationId: string
  exporting: boolean
  onExport: () => void
  onAsk: () => void
}

export function ProductHeader({ detail, conversationId, exporting, onExport, onAsk }: ProductHeaderProps) {
  const { t } = useTranslation()
  const { date } = useFormatters()
  const location = useLocation()
  const navigate = useNavigate()
  const { product } = detail

  // Opened from the results (or from the chat): step back so the filters, sort and page are exactly as they were.
  // A direct visit or a reload has no history of its own, so the link goes to the conversation.
  const goBack = (event: React.MouseEvent) => {
    if (location.key === 'default') return
    event.preventDefault()
    void navigate(-1)
  }

  return (
    <header className="flex flex-col gap-4">
      <a
        href={`/c/${conversationId}`}
        onClick={goBack}
        className="inline-flex w-fit items-center gap-1 rounded-md text-body-md text-body underline-offset-[3px] hover:text-ink hover:underline"
      >
        <Icon icon={ArrowLeft} size="sm" />
        {t('product.back')}
      </a>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-heading-lg font-semibold text-ink">{product.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-body-md text-mute">
            <span className="font-mono">{t('product.code', { code: product.code })}</span>
            <Badge>{t('product.abcClass', { class: product.abc_class })}</Badge>
            {product.risk && <RiskBadge level={product.risk} label={t(`product.risk.${product.risk}`)} />}
            <span>{t('product.dataUntil', { date: date(detail.data_until) })}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" iconLeft={<Icon icon={MessageCircle} />} onClick={onAsk}>
            {t('product.actions.ask')}
          </Button>
          <Button iconLeft={<Icon icon={Download} />} loading={exporting} onClick={onExport}>
            {t('product.actions.export')}
          </Button>
        </div>
      </div>
    </header>
  )
}

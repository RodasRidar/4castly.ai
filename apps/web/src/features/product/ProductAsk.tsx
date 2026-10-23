import { useTranslation } from 'react-i18next'
import { Drawer } from '../../ui/organisms/Drawer'
import { ChatPanel } from '../chat/ChatPanel'

interface ProductAskProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  productCode: string
  productName: string
}

/** Product-scoped chat in a drawer. The chat itself is `ChatPanel`; this only frames and scopes it. */
export function ProductAsk({ open, onOpenChange, conversationId, productCode, productName }: ProductAskProps) {
  const { t } = useTranslation()
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={t('product.ask.title', { name: productName })} closeLabel={t('product.ask.close')}>
      <ChatPanel
        conversationId={conversationId}
        productCode={productCode}
        className="min-h-0 flex-1"
        suggestions={[
          t('product.ask.suggestions.when', { name: productName }),
          t('product.ask.suggestions.why'),
          t('product.ask.suggestions.leadTime'),
        ]}
      />
    </Drawer>
  )
}

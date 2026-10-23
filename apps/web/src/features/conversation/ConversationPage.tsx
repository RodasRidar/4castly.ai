import { Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Placeholder } from '../Placeholder'
import { ConversationStage } from './ConversationStage'
import { useConversationOutlet } from './conversationContext'

export function ConversationPage() {
  const conversation = useConversationOutlet()
  return <ConversationStage conversation={conversation} />
}

/** Placeholder: product detail is F5. */
export function ProductDetailPage() {
  const { t } = useTranslation()
  const { productCode } = useParams()
  return <Placeholder icon={Package} title={t('pages.productTitle')} body={`${t('pages.productBody')} ${productCode ?? ''}`.trim()} />
}

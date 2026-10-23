import { MessageSquare, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { Placeholder } from '../Placeholder'

export function ConversationPage() {
  const { t } = useTranslation()
  return <Placeholder icon={MessageSquare} title={t('pages.conversationTitle')} body={t('pages.conversationBody')} />
}

export function ProductDetailPage() {
  const { t } = useTranslation()
  const { productCode } = useParams()
  return <Placeholder icon={Package} title={t('pages.productTitle')} body={`${t('pages.productBody')} ${productCode ?? ''}`.trim()} />
}

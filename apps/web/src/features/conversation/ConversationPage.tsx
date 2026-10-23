import { ConversationStage } from './ConversationStage'
import { useConversationOutlet } from './conversationContext'

export function ConversationPage() {
  const conversation = useConversationOutlet()
  return <ConversationStage conversation={conversation} />
}

export { ProductDetailPage } from '../product/ProductDetailPage'

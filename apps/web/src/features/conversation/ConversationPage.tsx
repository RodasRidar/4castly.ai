import { ConversationStage } from './ConversationStage'
import { useConversationOutlet } from './conversationContext'

export function ConversationPage() {
  const conversation = useConversationOutlet()
  return (
    <>
      {/* Every stage screen shares this page heading; the visible titles live in the thread and results header. */}
      <h1 className="sr-only">{conversation.title}</h1>
      <ConversationStage conversation={conversation} />
    </>
  )
}

export { ProductDetailPage } from '../product/ProductDetailPage'

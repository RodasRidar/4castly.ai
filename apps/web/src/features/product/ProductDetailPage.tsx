import { useParams } from 'react-router'
import { useConversationOutlet } from '../conversation/conversationContext'
import { isNotFound } from '../conversation/useConversationData'
import { ProductDetailView } from './ProductDetailView'
import { ProductError, ProductLoading, ProductNotFound, ProductNotReady } from './ProductStates'
import { useProductDetail } from './useProductData'

/** `/c/:conversationId/productos/:productCode`. Chooses between the loaded page and its loading / error states. */
export function ProductDetailPage() {
  const conversation = useConversationOutlet()
  const { productCode = '' } = useParams()
  const runId = conversation.current_run_id
  if (!runId) return <ProductNotReady conversationId={conversation.id} />
  return <ProductDetailLoader conversationId={conversation.id} runId={runId} code={productCode} />
}

function ProductDetailLoader({ conversationId, runId, code }: { conversationId: string; runId: string; code: string }) {
  const query = useProductDetail(runId, code)
  if (query.data) return <ProductDetailView key={code} detail={query.data} conversationId={conversationId} runId={runId} />
  if (isNotFound(query.error)) return <ProductNotFound conversationId={conversationId} />
  if (query.isError) return <ProductError onRetry={() => void query.refetch()} />
  return <ProductLoading />
}

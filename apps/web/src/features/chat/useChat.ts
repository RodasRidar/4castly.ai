import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import { ApiFailure, type ChatMessage, type ChatStreamEvent, type FeedbackValue } from '../../services/types'
import { applyStreamEvent, startDraft, type Draft } from './streamDraft'

export const chatKey = (conversationId: string) => ['chat', conversationId] as const

type Announcement = 'writing' | 'done' | 'stopped' | null

/**
 * Chat state for one conversation: the stored transcript (react-query) plus at most one live answer (`draft`)
 * built from the stream. The stored list stays the source of truth: after every answer it is refetched, and the
 * draft only bridges the gap while tokens arrive.
 */
export function useChat(conversationId: string, productCode?: string) {
  const { chat } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { t } = useTranslation()
  const key = chatKey(conversationId)

  const list = useQuery({ queryKey: key, queryFn: () => chat.list(conversationId), staleTime: Infinity })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [announcement, setAnnouncement] = useState<Announcement>(null)
  const controller = useRef<AbortController | null>(null)

  /** Consumes one stream into the draft, then reloads the stored transcript and drops the draft. */
  const consume = useCallback(
    async (open: (signal: AbortSignal) => AsyncIterable<ChatStreamEvent>, initial: Draft) => {
      const abort = new AbortController()
      controller.current = abort
      let current = initial
      setDraft(current)
      setAnnouncement('writing')
      try {
        for await (const event of open(abort.signal)) {
          current = applyStreamEvent(current, event)
          setDraft(current)
        }
        // A stream that ends without `message.end` was stopped by the user: the server keeps the partial answer
        // as interrupted and sends no closing frame.
        if (current.phase === 'streaming') current = { ...current, phase: abort.signal.aborted ? 'interrupted' : 'done' }
      } catch (error) {
        const ref = error instanceof ApiFailure ? error.problem.ref : ''
        current = { ...current, tools: [], phase: 'error', error: { messageKey: 'errors.generic', ref } }
      }
      setDraft(current)
      setAnnouncement(current.phase === 'done' ? 'done' : current.phase === 'interrupted' ? 'stopped' : null)

      await queryClient.invalidateQueries({ queryKey: key })
      // The stored copy is canonical, but the stream already delivered the cited figures: keep them until the
      // next list load if the server did not echo them back.
      if (current.phase === 'done' && current.annotations.length > 0) {
        queryClient.setQueryData<ChatMessage[]>(key, (old) =>
          old?.map((m) => (m.id === current.messageId && !m.annotations?.length ? { ...m, annotations: current.annotations } : m)),
        )
      }
      controller.current = null
      setDraft(null)
    },
    [queryClient, key],
  )

  const send = useCallback(
    (text: string) => {
      const optimistic: ChatMessage = {
        id: `pending-${crypto.randomUUID()}`,
        conversation_id: conversationId,
        role: 'user',
        status: 'complete',
        display_text: text,
        payload: { kind: 'text' },
        annotations: [],
        context_product_code: productCode ?? null,
        feedback: null,
        created_at: new Date().toISOString(),
      }
      queryClient.setQueryData<ChatMessage[]>(key, (old) => [...(old ?? []), optimistic])
      return consume(
        (signal) => chat.send(conversationId, { text, context_product_code: productCode ?? null }, signal),
        startDraft(`pending-${crypto.randomUUID()}`),
      )
    },
    [chat, consume, conversationId, key, productCode, queryClient],
  )

  // The API appends a NEW assistant message and leaves the failed one in the history, so the draft gets its own
  // placeholder id (it follows `message.start`) instead of standing in for the message being retried.
  const retry = useCallback(
    (messageId: string) => consume((signal) => chat.retry(messageId, signal), startDraft(`pending-${crypto.randomUUID()}`)),
    [chat, consume],
  )

  const stop = useCallback(() => controller.current?.abort(), [])

  const feedback = useMutation({
    mutationFn: ({ id, value }: { id: string; value: FeedbackValue | null }) => chat.feedback(id, value),
    onMutate: ({ id, value }) => {
      const previous = queryClient.getQueryData<ChatMessage[]>(key)
      queryClient.setQueryData<ChatMessage[]>(key, (old) => old?.map((m) => (m.id === id ? { ...m, feedback: value } : m)))
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous)
      notify('error', t('chat.feedbackFailed'))
    },
  })

  /** Clicking the active rating clears it. */
  const rate = useCallback(
    (id: string, value: FeedbackValue) => {
      const current = list.data?.find((m) => m.id === id)?.feedback ?? null
      feedback.mutate({ id, value: current === value ? null : value })
    },
    [feedback, list.data],
  )

  return {
    messages: list.data ?? [],
    status: list.isPending ? ('loading' as const) : list.isError ? ('error' as const) : ('ready' as const),
    reload: () => void list.refetch(),
    draft,
    generating: draft !== null,
    streaming: draft?.phase === 'streaming',
    announcement,
    send,
    stop,
    retry,
    rate,
  }
}

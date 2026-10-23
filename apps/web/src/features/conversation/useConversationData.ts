import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useServices } from '../../services/servicesContext'
import type { ClarificationAnswers, ConversationStage, Job } from '../../services/types'
import { ApiFailure } from '../../services/types'

/** Polling cadence. A mutable seam so tests can poll fast instead of waiting a second per step. */
export const pollConfig = { ms: 1000 }

export const conversationKey = (id: string) => ['conversation', id] as const
export const planKey = (id: string) => ['plan', id] as const
export const jobKey = (id: string) => ['job', id] as const
export const answersKey = (id: string) => ['forecast-answers', id] as const

/** Stages in which the backend is still working and will move on by itself. */
const TRANSITIONAL: ConversationStage[] = ['queued', 'uploaded', 'digesting', 'calculating']

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiFailure && error.problem.code === 'not_found'
}

export function useConversationQuery(id: string) {
  const { conversations } = useServices()
  return useQuery({
    queryKey: conversationKey(id),
    queryFn: () => conversations.get(id),
    // Without a job to watch, poll the conversation itself while the backend is working.
    refetchInterval: (query) => {
      const c = query.state.data
      return c && TRANSITIONAL.includes(c.stage) && !c.current_job_id ? pollConfig.ms : false
    },
  })
}

export function usePlanQuery(id: string, enabled: boolean) {
  const { conversations } = useServices()
  return useQuery({ queryKey: planKey(id), queryFn: () => conversations.getPlan(id), enabled })
}

const running = (job: Job | undefined) => job?.status === 'queued' || job?.status === 'running'

/** Polls a job until it settles, then refreshes the conversation so the backend's next stage shows up. */
export function useJobQuery(conversationId: string, jobId: string | null | undefined) {
  const { jobs } = useServices()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: jobKey(jobId ?? 'none'),
    queryFn: () => jobs.get(jobId!),
    enabled: !!jobId,
    refetchInterval: (q) => (running(q.state.data) || !q.state.data ? pollConfig.ms : false),
  })
  const settled = query.data && !running(query.data) ? query.data.status : null
  useEffect(() => {
    if (!settled) return
    void queryClient.invalidateQueries({ queryKey: conversationKey(conversationId) })
    void queryClient.invalidateQueries({ queryKey: planKey(conversationId) })
  }, [settled, conversationId, queryClient])
  return query
}

/** Answers the user chose for the last forecast request, kept so "Reintentar" can repeat them. */
export function useRememberedAnswers(id: string) {
  const queryClient = useQueryClient()
  return {
    get: () => queryClient.getQueryData<ClarificationAnswers | null>(answersKey(id)),
    set: (answers: ClarificationAnswers | null) => queryClient.setQueryData(answersKey(id), answers),
  }
}

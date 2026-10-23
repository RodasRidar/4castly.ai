import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlanView } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { Skeleton } from '../../ui/atoms/Skeleton'
import { ErrorState } from '../../ui/molecules/ErrorState'

/** Loading and error states for anything that needs the plan; renders `children(plan)` once it is there. */
export function PlanLoader({ query, children }: { query: UseQueryResult<PlanView>; children: (plan: PlanView) => ReactNode }) {
  const { t } = useTranslation()
  if (query.data) return <>{children(query.data)}</>
  if (query.isError) {
    return (
      <ErrorState
        title={t('conversation.loadErrorTitle')}
        body={t('conversation.loadErrorBody')}
        primaryAction={<Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>}
      />
    )
  }
  return (
    <div className="flex flex-col gap-3" role="status" aria-label={t('common.loading')}>
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  )
}

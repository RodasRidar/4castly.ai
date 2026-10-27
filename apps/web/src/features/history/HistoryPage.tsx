import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageSquare, SearchX } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorTextOf } from '../../app/errorText'
import { useNotify } from '../../app/notifyContext'
import { conversationsKey } from '../../layouts/keys'
import { useDeleteConversation } from '../../layouts/useDeleteConversation'
import { useServices } from '../../services/servicesContext'
import type { Conversation } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { Skeleton } from '../../ui/atoms/Skeleton'
import { Switch } from '../../ui/atoms/Switch'
import { TextLink } from '../../ui/atoms/TextLink'
import { EmptyState } from '../../ui/molecules/EmptyState'
import { ErrorState } from '../../ui/molecules/ErrorState'
import { SearchField } from '../../ui/molecules/SearchField'
import { Dialog } from '../../ui/organisms/Dialog'
import { HistoryRow } from './HistoryRow'
import { historyConfig } from './historyConfig'
import { useConversationHistory } from './useConversationHistory'
import { useHistoryParams } from './useHistoryParams'

/** Full conversation list (plan 2.1): search, archived toggle, cursor paging, unarchive and delete with undo. */
export function HistoryPage() {
  const { t } = useTranslation()
  const { conversations } = useServices()
  const queryClient = useQueryClient()
  const notify = useNotify()
  const { q, archived, update } = useHistoryParams()
  const archivedId = useId()
  const history = useConversationHistory(q, archived)
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)

  // The input keeps what the user types; the URL (and the query) follow after a short pause. A URL change we did
  // not make ourselves (back button, a link) is adopted into the input; our own pushes never overwrite typing.
  const [draft, setDraft] = useState(q)
  const [previousQ, setPreviousQ] = useState(q)
  const [pushed, setPushed] = useState(q)
  if (q !== previousQ) {
    setPreviousQ(q)
    if (q !== pushed) {
      setPushed(q)
      setDraft(q)
    }
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onSearch = (value: string) => {
    setDraft(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setPushed(value.trim())
      update({ q: value.trim() }, { replace: true })
    }, historyConfig.debounceMs)
  }
  const clearSearch = () => {
    clearTimeout(timer.current)
    setDraft('')
    setPushed('')
    update({ q: '' })
  }

  const unarchive = useMutation({
    mutationFn: (id: string) => conversations.update(id, { archived: false }),
    onError: (error) => notify('error', errorTextOf(t, error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: conversationsKey }),
  })
  const remove = useDeleteConversation()

  const items = history.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-heading-lg font-semibold text-ink">{t('history.title')}</h1>

      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-64 flex-1">
          <SearchField
            aria-label={t('history.search')}
            placeholder={t('history.search')}
            value={draft}
            onValueChange={onSearch}
            clearLabel={t('history.clearField')}
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id={archivedId} checked={archived} onCheckedChange={(checked) => update({ archived: checked })} />
          <label htmlFor={archivedId} className="text-body-md text-body">
            {t('history.showArchived')}
          </label>
        </div>
      </div>

      {history.isPending ? (
        <div role="status" aria-label={t('common.loading')} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : history.isError ? (
        <ErrorState
          title={t('conversations.errorTitle')}
          body={t('conversations.errorBody')}
          primaryAction={
            <Button variant="secondary" size="sm" onClick={() => void history.refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        q || archived ? (
          <EmptyState
            icon={SearchX}
            title={t('history.noResultsTitle')}
            body={t('history.noResultsBody')}
            action={
              q ? (
                <Button variant="secondary" size="sm" onClick={clearSearch}>
                  {t('history.clearSearch')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            icon={MessageSquare}
            title={t('conversations.emptyTitle')}
            body={t('conversations.emptyBody')}
            action={<TextLink href="/nuevo">{t('nav.newForecast')}</TextLink>}
          />
        )
      ) : (
        <>
          <ul aria-label={t('history.list')} className="flex flex-col gap-2">
            {items.map((c) => (
              <HistoryRow key={c.id} conversation={c} onUnarchive={() => unarchive.mutate(c.id)} onDelete={() => setPendingDelete(c)} />
            ))}
          </ul>
          {history.hasNextPage && (
            <Button variant="secondary" className="self-center" loading={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
              {t('history.loadMore')}
            </Button>
          )}
        </>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t('conversations.confirmDeleteTitle')}
        description={pendingDelete ? t('conversations.confirmDeleteBodyNamed', { title: pendingDelete.title }) : t('conversations.confirmDeleteBody')}
        closeLabel={t('common.close')}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>
            {t('conversations.cancel')}
          </Button>
          <Button
            variant="danger-text"
            onClick={() => {
              if (pendingDelete) remove.mutate(pendingDelete.id)
              setPendingDelete(null)
            }}
          >
            {t('conversations.delete')}
          </Button>
        </div>
      </Dialog>
    </section>
  )
}

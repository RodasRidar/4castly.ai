import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useNotify } from '../../app/notifyContext'
import { cn } from '../../lib/cn'
import type { ConversationDetail } from '../../services/types'
import { ErrorState } from '../../ui/molecules/ErrorState'
import { Drawer } from '../../ui/organisms/Drawer'
import { ExportMenu } from '../../ui/organisms/ExportMenu'
import { ResultsHeader } from '../../ui/organisms/ResultsHeader'
import { ViewTabs } from '../../ui/organisms/ViewTabs'
import { ChatPanel } from '../chat/ChatPanel'
import { ParametersSection } from './ParametersSection'
import { ResultsPanel } from './ResultsPanel'
import { useExportFile } from './useExportFile'
import { useResultsParams } from './useResultsParams'

/**
 * The `ready` stage (plan 2.1): chat 40 % + results 60 %, or the portfolio at full width with the assistant in a
 * drawer. The view lives in `?vista=` together with the filters.
 */
export function ResultsScreen({ conversation }: { conversation: ConversationDetail }) {
  const { t } = useTranslation()
  const { pathname, search } = useLocation()
  const notify = useNotify()
  const { state, update } = useResultsParams()
  const [selected, setSelected] = useState<string[]>([])
  const [parametersOpen, setParametersOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const runId = conversation.current_run_id
  const exporter = useExportFile(runId ?? '')

  if (!runId) {
    return <ErrorState title={t('results.table.errorTitle')} body={t('results.table.errorBody')} />
  }

  const portfolio = state.view === 'portfolio'

  const share = async () => {
    try {
      await navigator.clipboard.writeText(new URL(`${pathname}${search}`, window.location.origin).toString())
      notify('success', t('results.header.shareDone'))
    } catch {
      notify('error', t('results.header.shareError'))
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6', !portfolio && 'lg:overflow-hidden')}>
      <ResultsHeader
        navLabel={t('results.header.nav')}
        breadcrumb={[
          { label: t('results.header.root'), href: '/historial' },
          { label: conversation.title, href: `/c/${conversation.id}` },
          { label: t('results.header.current') },
        ]}
        shareLabel={t('results.header.share')}
        onShare={() => void share()}
        exportMenu={
          <ExportMenu
            triggerLabel={t('results.header.export')}
            allLabel={t('results.header.exportAll')}
            selectionLabel={t('results.header.exportSelection')}
            productLabel={t('results.header.exportProduct')}
            onExportAll={exporter.exportAll}
            onExportSelection={portfolio ? () => exporter.exportSelection(selected) : undefined}
            selectionDisabled={selected.length === 0}
            disabled={exporter.exporting}
          />
        }
      />
      <ViewTabs
        aria-label={t('results.tabs.label')}
        tabs={[
          { value: 'chat', label: t('results.tabs.chat') },
          { value: 'portfolio', label: t('results.tabs.portfolio') },
        ]}
        value={state.view}
        onValueChange={(view) => update({ view: view === 'portfolio' ? 'portfolio' : 'chat' })}
      />

      {portfolio ? (
        <>
          <ResultsPanel
            runId={runId}
            conversationId={conversation.id}
            state={state}
            update={update}
            portfolio
            selected={selected}
            onSelectedChange={setSelected}
            onExportSelection={() => exporter.exportSelection(selected)}
            onOpenParameters={() => setParametersOpen(true)}
            onAsk={() => setAskOpen(true)}
          />
          <Drawer open={askOpen} onOpenChange={setAskOpen} title={t('results.ask.title')} closeLabel={t('results.ask.close')}>
            <ChatPanel conversationId={conversation.id} className="min-h-0 flex-1" />
          </Drawer>
        </>
      ) : (
        // From `lg` the two columns are viewport-high panes: the thread scrolls inside the chat column with the composer
        // pinned at its bottom, and the results scroll on their own. Below `lg` the page scrolls and the chat gets a
        // bounded height, so the composer never ends up thousands of pixels down.
        <div className="grid flex-1 gap-6 lg:min-h-0 lg:grid-cols-[2fr_3fr] lg:grid-rows-[minmax(0,1fr)]">
          <section
            aria-label={t('results.chatColumn')}
            className="order-2 flex h-[min(40rem,75dvh)] min-w-0 flex-col overflow-hidden rounded-lg border border-hairline lg:order-1 lg:h-auto lg:min-h-0"
          >
            <ChatPanel conversationId={conversation.id} className="min-h-0 flex-1" />
          </section>
          <div className="order-1 min-w-0 lg:order-2 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
            <ResultsPanel
              runId={runId}
              conversationId={conversation.id}
              state={state}
              update={update}
              portfolio={false}
              selected={selected}
              onSelectedChange={setSelected}
              onExportSelection={() => exporter.exportSelection(selected)}
              onOpenParameters={() => setParametersOpen(true)}
            />
          </div>
        </div>
      )}

      <ParametersSection runId={runId} conversationId={conversation.id} open={parametersOpen} onOpenChange={setParametersOpen} />
    </div>
  )
}

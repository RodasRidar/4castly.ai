import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useNotify } from '../../app/notifyContext'
import { useMediaQuery } from '../../app/useMediaQuery'
import { cn } from '../../lib/cn'
import type { ConversationDetail } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { Icon } from '../../ui/atoms/Icon'
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
 * The `ready` stage (plan 2.1): chat 40 % + results 60 % from `lg`; the portfolio, and any narrower screen, shows the
 * results at full width with the assistant in a drawer. The view lives in `?vista=` together with the filters.
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
  const wide = useMediaQuery('(min-width: 1024px)')

  if (!runId) {
    return <ErrorState title={t('results.table.errorTitle')} body={t('results.table.errorBody')} />
  }

  const portfolio = state.view === 'portfolio'
  // Side by side only when there is room; otherwise the chat opens in a drawer from the "Ask" button.
  const drawerChat = portfolio || !wide

  const share = async () => {
    try {
      await navigator.clipboard.writeText(new URL(`${pathname}${search}`, window.location.origin).toString())
      notify('success', t('results.header.shareDone'))
    } catch {
      notify('error', t('results.header.shareError'))
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col gap-4 p-4 md:p-6', 'overflow-hidden')}>
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

      {drawerChat ? (
        <>
          {/* Header and tabs stay put; only the results scroll. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ResultsPanel
              runId={runId}
              conversationId={conversation.id}
              state={state}
              update={update}
              portfolio={portfolio}
              selected={selected}
              onSelectedChange={setSelected}
              onExportSelection={() => exporter.exportSelection(selected)}
              onOpenParameters={() => setParametersOpen(true)}
            />
            {/* Always within reach, however far the results are scrolled. */}
            <div className="pointer-events-none sticky bottom-0 flex justify-end pt-4">
              <Button
                className="pointer-events-auto shadow-popover"
                iconLeft={<Icon icon={MessageSquare} />}
                onClick={() => setAskOpen(true)}
              >
                {t('results.ask.button')}
              </Button>
            </div>
          </div>
          <Drawer open={askOpen} onOpenChange={setAskOpen} title={t('results.ask.title')} closeLabel={t('results.ask.close')}>
            <ChatPanel conversationId={conversation.id} className="min-h-0 flex-1" />
          </Drawer>
        </>
      ) : (
        // Viewport-high panes: the thread scrolls inside the chat column with the composer pinned at its bottom,
        // and the results scroll on their own.
        <div className="grid min-h-0 flex-1 grid-cols-[2fr_3fr] grid-rows-[minmax(0,1fr)] gap-6">
          <section
            aria-label={t('results.chatColumn')}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-hairline"
          >
            <ChatPanel conversationId={conversation.id} className="min-h-0 flex-1" />
          </section>
          <div className="min-h-0 min-w-0 overflow-y-auto pr-1">
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

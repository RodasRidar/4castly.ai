import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNotify } from '../../app/notifyContext'
import { useServices } from '../../services/servicesContext'
import type { ExportRequest } from '../../services/types'

/** Triggers the browser download of a signed file URL. */
function download(url: string, fileName: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
}

export function useExportFile(runId: string) {
  const { runs } = useServices()
  const notify = useNotify()
  const { t } = useTranslation()
  const mutation = useMutation({
    mutationFn: (request: ExportRequest) => runs.createExport(runId, request),
    onSuccess: (file) => {
      download(file.download_url, file.file_name)
      notify('success', t('results.header.exportDone', { name: file.file_name }))
    },
    onError: () => notify('error', t('results.header.exportError')),
  })
  return {
    exporting: mutation.isPending,
    exportAll: () => mutation.mutate({ format: 'xlsx', scope: 'all' }),
    exportSelection: (codes: string[]) => mutation.mutate({ format: 'xlsx', scope: 'selection', codes }),
  }
}

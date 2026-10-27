import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Database, FileSpreadsheet, Sheet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useNotify } from '../../app/notifyContext'
import { conversationsKey } from '../../layouts/keys'
import { triggerDownload } from '../product/download'
import { useServices } from '../../services/servicesContext'
import { ApiFailure } from '../../services/types'
import { Button } from '../../ui/atoms/Button'
import { NumberValue } from '../../ui/atoms/NumberValue'
import { SourceCard } from '../../ui/organisms/SourceCard'
import { UploadDropzone, type UploadDropzoneState } from '../../ui/organisms/UploadDropzone'
import { ACCEPT_ATTRIBUTE, contentTypeOf, isSupportedFile, sizeParts } from './uploadFile'

type Problem = { kind: 'unsupported' } | { kind: 'failed'; ref?: string }

/** Upload entry point: the file goes straight to storage, then the API starts digestion and opens its conversation. */
export function NewForecastPage() {
  const { t, i18n } = useTranslation()
  const { uploads } = useServices()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const notify = useNotify()
  const [file, setFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [progress, setProgress] = useState(0)

  // The template endpoint needs the session token, so a plain link would 401: fetch it, then save the blob.
  const template = useMutation({
    mutationFn: () => uploads.downloadTemplate(),
    onSuccess: ({ blob, fileName }) => {
      const url = URL.createObjectURL(blob)
      triggerDownload(url, fileName)
      URL.revokeObjectURL(url)
    },
    onError: () => notify('error', t('upload.templateError')),
  })

  const upload = useMutation({
    mutationFn: async (selected: File) => {
      setProgress(0)
      const ticket = await uploads.create({
        file_name: selected.name,
        size_bytes: selected.size,
        content_type: contentTypeOf(selected),
      })
      await uploads.put(ticket, selected, setProgress)
      return uploads.complete(ticket.upload_id)
    },
    onSuccess: async ({ conversation_id }) => {
      // Wait for the sidebar list so the conversation guard finds the new id on arrival.
      await queryClient.invalidateQueries({ queryKey: conversationsKey })
      await navigate(`/c/${conversation_id}`)
    },
    onError: (error) => setProblem({ kind: 'failed', ref: error instanceof ApiFailure ? error.problem.ref : undefined }),
  })

  const uploading = upload.isPending
  const onFile = (next: File) => {
    if (!isSupportedFile(next.name)) {
      setFile(null)
      setProblem({ kind: 'unsupported' })
      return
    }
    setFile(next)
    setProblem(null)
  }

  const state: UploadDropzoneState = uploading ? 'uploading' : problem ? 'upload_error' : file ? 'attached' : 'empty'
  const errorText =
    problem?.kind === 'unsupported'
      ? t('upload.unsupported')
      : problem?.ref
        ? t('upload.failedWithRef', { ref: problem.ref })
        : t('upload.failed')
  const size = file ? sizeParts(file.size) : null
  const percent = Math.round(progress * 100)

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-lg font-semibold text-ink">{t('upload.title')}</h1>
        <p className="max-w-prose text-body-md text-body">{t('upload.subtitle')}</p>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <SourceCard
          variant="upload"
          icon={FileSpreadsheet}
          title={t('upload.cardTitle')}
          description={t('upload.cardDescription')}
          className="md:col-span-2"
        >
          <UploadDropzone
            state={state}
            onFile={onFile}
            accept={ACCEPT_ATTRIBUTE}
            windowDrop
            
            file={file && size ? { name: file.name, size: <NumberValue value={size.value} unit={size.unit} locale={i18n.language} maximumFractionDigits={size.unit === 'MB' ? 1 : 0} /> } : undefined}
            prompt={t('upload.prompt')}
            hint={t('upload.hint')}
            inputLabel={t('upload.inputLabel')}
            changeLabel={t('upload.changeFile')}
            removeLabel={t('upload.removeFile')}
            onRemove={() => {
              setFile(null)
              setProblem(null)
            }}
            uploadingText={t('upload.uploadingChip', { percent })}
            errorText={errorText}
            windowDropLabel={t('upload.windowDrop')}
            statusLine={uploading ? t('upload.uploadingStatus') : state === 'attached' ? t('upload.ready') : undefined}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => template.mutate()} loading={template.isPending}>
              {t('upload.template')}
            </Button>
            <Button disabled={!file || uploading} loading={uploading} onClick={() => file && upload.mutate(file)}>
              {t('upload.continue')}
            </Button>
          </div>
          <p className="text-body-sm text-mute">{t('upload.privacy')}</p>
        </SourceCard>
        <div className="flex flex-col gap-4">
          <SourceCard variant="soon" icon={Sheet} title={t('upload.sheets')} description={t('upload.sheetsDescription')} soonLabel={t('upload.soon')} />
          <SourceCard variant="soon" icon={Database} title={t('upload.database')} description={t('upload.databaseDescription')} soonLabel={t('upload.soon')} />
        </div>
      </div>
    </div>
  )
}

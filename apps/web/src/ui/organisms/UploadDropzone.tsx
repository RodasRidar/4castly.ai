import { Upload } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { Icon } from '../atoms/Icon'
import { FileChip } from '../molecules/FileChip'

export type UploadDropzoneState = 'empty' | 'dragging' | 'attached' | 'uploading' | 'upload_error'

export interface UploadDropzoneFile {
  name: string
  /** Pre-formatted size, e.g. "1,2 MB". */
  size?: ReactNode
}

export interface UploadDropzoneProps {
  /** `dragging` can be forced (stories); real drags are tracked internally. */
  state: UploadDropzoneState
  onFile: (file: File) => void
  /** Native `accept` string, e.g. ".xlsx,.xls". */
  accept?: string
  file?: UploadDropzoneFile
  /** Listens on the window and shows a full-screen overlay while a file is dragged. */
  windowDrop?: boolean
  prompt: string
  hint?: string
  /** Visible only to assistive tech: name of the hidden native file input. */
  inputLabel: string
  changeLabel: string
  removeLabel: string
  onRemove?: () => void
  uploadingText: string
  errorText: string
  windowDropLabel?: string
  /** Slot above the continue button (e.g. "Listo para continuar"). */
  statusLine?: ReactNode
  className?: string
}

const hasFiles = (e: { dataTransfer: DataTransfer | null }) => !!e.dataTransfer && Array.from(e.dataTransfer.types ?? []).includes('Files')

export function UploadDropzone({
  state,
  onFile,
  accept,
  file,
  windowDrop,
  prompt,
  hint,
  inputLabel,
  changeLabel,
  removeLabel,
  onRemove,
  uploadingText,
  errorText,
  windowDropLabel,
  statusLine,
  className,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [over, setOver] = useState(false)
  const [windowOver, setWindowOver] = useState(false)
  const zoneRef = useRef<HTMLDivElement>(null)
  const accepting = state !== 'uploading'
  const onFileRef = useRef(onFile)
  const acceptingRef = useRef(accepting)
  useEffect(() => {
    onFileRef.current = onFile
    acceptingRef.current = accepting
  })

  const dragging = state === 'dragging' || (over && accepting)
  const shownState = dragging ? 'dragging' : state
  const picker = () => inputRef.current?.click()

  useEffect(() => {
    if (!windowDrop) return
    let count = 0
    const enter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return
      count += 1
      setWindowOver(true)
    }
    const move = (e: globalThis.DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const leave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return
      count = Math.max(0, count - 1)
      if (count === 0) setWindowOver(false)
    }
    const drop = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      count = 0
      setWindowOver(false)
      // Drops on the zone are reported by the zone handler; ignore them here.
      if (e.target instanceof Node && zoneRef.current?.contains(e.target)) return
      const f = e.dataTransfer?.files?.[0]
      if (f && acceptingRef.current) onFileRef.current(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', move)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', move)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [windowDrop])

  const zoneHandlers = accepting
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          depth.current += 1
          setOver(true)
        },
        onDragOver: (e: DragEvent) => {
          if (hasFiles(e)) e.preventDefault()
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e)) return
          depth.current = Math.max(0, depth.current - 1)
          if (depth.current === 0) setOver(false)
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return
          e.preventDefault()
          depth.current = 0
          setOver(false)
          const f = e.dataTransfer.files[0]
          if (f) onFile(f)
        },
      }
    : {
        // Swallow the drop so the browser does not navigate to the file while uploading.
        onDragOver: (e: DragEvent) => e.preventDefault(),
        onDrop: (e: DragEvent) => e.preventDefault(),
      }

  const showChip = !!file && (state === 'attached' || state === 'uploading' || state === 'upload_error')

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div
        ref={zoneRef}
        data-testid="dropzone"
        data-state={shownState}
        {...zoneHandlers}
        className={cn(
          'flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-6 text-center',
          dragging ? 'border-ink bg-selected' : 'border-hairline bg-canvas',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          tabIndex={-1}
          aria-label={inputLabel}
          aria-hidden="true"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
        {showChip ? (
          <FileChip
            name={file.name}
            size={file.size}
            state={state === 'uploading' ? 'uploading' : state === 'upload_error' ? 'error' : 'idle'}
            uploadingText={uploadingText}
            errorText={errorText}
            onChange={state === 'uploading' ? undefined : picker}
            changeLabel={changeLabel}
            onRemove={state === 'uploading' ? undefined : onRemove}
            removeLabel={removeLabel}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={picker}
              className="flex flex-col items-center gap-2 rounded-md px-4 py-2 text-ink"
            >
              <Icon icon={Upload} size="lg" className="text-mute" />
              <span className="text-body-md font-medium">{prompt}</span>
            </button>
            {hint && <p className="text-body-sm text-mute">{hint}</p>}
            {state === 'upload_error' && (
              <p role="alert" className="text-body-sm text-critical">
                {errorText}
              </p>
            )}
          </>
        )}
      </div>
      {statusLine && (
        <div aria-live="polite" className="text-body-md text-body">
          {statusLine}
        </div>
      )}
      {windowDrop && windowOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-scrim p-6">
          <div className="flex w-full max-w-lg items-center justify-center rounded-lg border-2 border-dashed border-ink bg-elevated px-6 py-16 text-heading-md font-semibold text-ink">
            {windowDropLabel}
          </div>
        </div>
      )}
    </div>
  )
}

import type { UploadService } from '../ports'
import { ApiFailure, type UploadCompleted, type UploadTicket } from '../types'
import type { HttpClient } from './client'

export interface UploadOptions {
  /** Injected in tests. Defaults to `new XMLHttpRequest()`. */
  createXhr?: () => XMLHttpRequest
}

const uploadFailed = (status: number) =>
  new ApiFailure({ type: 'about:blank', title: 'upload_failed', status, code: 'upload_failed', message_key: 'errors.uploadFailed', ref: '' })

export function createHttpUploadService(client: HttpClient, { createXhr = () => new XMLHttpRequest() }: UploadOptions = {}): UploadService {
  return {
    create: (file) => client.json<UploadTicket>('POST', '/v1/uploads', { body: file }),

    // XMLHttpRequest, not fetch: only XHR reports upload progress. The storage URL is signed, so no bearer token.
    put(ticket, file, onProgress) {
      return new Promise<void>((resolve, reject) => {
        const xhr = createXhr()
        xhr.open(ticket.method, ticket.upload_url)
        for (const [name, value] of Object.entries(ticket.headers ?? {})) xhr.setRequestHeader(name, value)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total)
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(1)
            resolve()
          } else {
            reject(uploadFailed(xhr.status))
          }
        }
        xhr.onerror = () => reject(uploadFailed(0))
        xhr.ontimeout = () => reject(uploadFailed(0))
        xhr.onabort = () => reject(uploadFailed(0))
        xhr.send(file)
      })
    },

    // One completion per upload, so the key can be derived from it: a repeated call replays the first answer.
    complete: (uploadId) =>
      client.json<UploadCompleted>('POST', `/v1/uploads/${encodeURIComponent(uploadId)}/complete`, {
        headers: { 'Idempotency-Key': `complete-${uploadId}` },
      }),

    async downloadTemplate() {
      const file = await client.blob('GET', '/v1/templates/sales.xlsx')
      return { blob: file.blob, fileName: file.fileName ?? 'plantilla-ventas.xlsx' }
    },
  }
}

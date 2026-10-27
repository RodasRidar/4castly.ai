import type { JobService } from '../ports'
import type { Job } from '../types'
import type { HttpClient } from './client'

/** The screens poll `get`: the API documents it as the fallback of the event stream. */
export function createHttpJobService(client: HttpClient): JobService {
  return {
    get: (id) => client.json<Job>('GET', `/v1/jobs/${encodeURIComponent(id)}`),
    cancel: (id) => client.json<Job>('POST', `/v1/jobs/${encodeURIComponent(id)}/cancel`),
  }
}

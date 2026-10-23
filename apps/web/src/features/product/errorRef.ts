import { ApiFailure } from '../../services/types'

/** Short support reference carried by every API problem; empty when the failure did not come from the API. */
export function errorRef(error: unknown): string {
  return error instanceof ApiFailure ? error.problem.ref : ''
}

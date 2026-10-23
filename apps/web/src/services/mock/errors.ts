import errors from './fixtures/errors.json'
import { ApiFailure, type ApiError } from '../types'

/** Problem bodies come from the generated fixtures so mock failures look exactly like the API's. */
export function failure(kind: keyof typeof errors, override: Partial<ApiError> = {}): ApiFailure {
  return new ApiFailure({ ...(errors[kind] as ApiError), ...override })
}

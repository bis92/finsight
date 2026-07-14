import type { ApiError } from '@/lib/apiClient'

export type QueryState =
  | { status: 'loading'; error: null }
  | { status: 'error'; error: ApiError }
  | { status: 'empty'; error: null }
  | { status: 'success'; error: null }

export function queryState(
  isPending: boolean,
  error: Error | null,
  isEmpty: boolean,
): QueryState {
  if (isPending) {
    return { status: 'loading', error: null }
  }
  if (error) {
    return { status: 'error', error: error as ApiError }
  }
  if (isEmpty) {
    return { status: 'empty', error: null }
  }
  return { status: 'success', error: null }
}

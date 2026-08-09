'use client'

import { useQuery } from '@tanstack/react-query'

import { ApiError, apiClient } from '@/lib/apiClient'
import type { AccountSummary } from '@/types'

import { queryState } from '../queryState'

export const accountKeys = {
  current: ['account'] as const,
}

export function useAccount() {
  const query = useQuery({
    queryKey: accountKeys.current,
    queryFn: () => apiClient.get<AccountSummary>('/api/account'),
    retry: (failureCount, error) =>
      error instanceof ApiError && error.status === 401 ? false : failureCount < 2,
  })

  const isUnauthenticated =
    query.error instanceof ApiError && query.error.status === 401

  return {
    ...query,
    account: query.data,
    isUnauthenticated,
    queryState: queryState(query.isPending, query.error, query.data === undefined),
  }
}

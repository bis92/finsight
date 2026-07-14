'use client'

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import type { Insight, SubscriptionCandidate } from '@/types'

import { queryState } from '../queryState'

export type ProReport = {
  period: string
  insights: Insight[]
  subscriptions: SubscriptionCandidate[]
}

export const analysisKeys = {
  all: ['analyses'] as const,
  proReport: (period: string) => ['analyses', 'pro-report', period] as const,
}

export function useProReport(period: string) {
  const query = useQuery({
    queryKey: analysisKeys.proReport(period),
    queryFn: () => apiClient.get<ProReport>(
      `/api/pro-report?period=${encodeURIComponent(period)}`,
    ),
  })

  return {
    ...query,
    report: query.data,
    queryState: queryState(
      query.isPending,
      query.error,
      query.data !== undefined
        && query.data.insights.length === 0
        && query.data.subscriptions.length === 0,
    ),
  }
}

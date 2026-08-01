'use client'

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import type { Insight, SubscriptionCandidate } from '@/types'

import { queryState } from '../queryState'

export type ProReport = {
  period: string
  insights: Insight[]
  subscriptions: SubscriptionCandidate[]
  /** Opus 진단이 실패해 내부 규칙 엔진으로 폴백했는지 여부. */
  aiDegraded?: boolean
}

export const analysisKeys = {
  all: ['analyses'] as const,
  proReport: (period: string) => ['analyses', 'pro-report', period] as const,
}

export function useProReport(period: string, enabled = true) {
  const query = useQuery({
    queryKey: analysisKeys.proReport(period),
    queryFn: () => apiClient.get<ProReport>(
      `/api/pro-report?period=${encodeURIComponent(period)}`,
    ),
    enabled,
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

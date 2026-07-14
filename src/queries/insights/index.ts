'use client'

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import type { Insight } from '@/types'

import { queryState } from '../queryState'

type InsightsResponse = {
  period: string
  insights: Insight[]
}

export const insightKeys = {
  all: ['insights'] as const,
  period: (period: string) => ['insights', period] as const,
}

export function useInsights(period: string, guest = false) {
  const query = useQuery({
    queryKey: [...insightKeys.period(period), guest],
    queryFn: () => apiClient.get<InsightsResponse>(
      `/api/insights?period=${encodeURIComponent(period)}${guest ? '&guest=1' : ''}`,
    ),
  })

  return {
    ...query,
    insights: query.data?.insights ?? [],
    queryState: queryState(query.isPending, query.error, query.data?.insights.length === 0),
  }
}

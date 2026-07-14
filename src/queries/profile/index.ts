'use client'

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import type { Profile } from '@/types'

import { queryState } from '../queryState'

export const profileKeys = {
  current: ['profile'] as const,
}

export function useProfile() {
  const query = useQuery({
    queryKey: profileKeys.current,
    queryFn: () => apiClient.get<Profile>('/api/profile'),
  })

  return {
    ...query,
    profile: query.data,
    queryState: queryState(query.isPending, query.error, query.data === undefined),
  }
}

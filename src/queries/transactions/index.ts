'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import type { Category, DateRange, Transaction } from '@/types'

import { queryState } from '../queryState'

export const transactionKeys = {
  all: ['transactions'] as const,
  list: (range?: DateRange) => ['transactions', range ?? null] as const,
}

export function useTransactions(range?: DateRange) {
  const query = useQuery({
    queryKey: transactionKeys.list(range),
    queryFn: () => {
      const params = new URLSearchParams()
      if (range) {
        params.set('from', range.from)
        params.set('to', range.to)
      }
      const queryString = params.toString()
      return apiClient.get<{ transactions: Transaction[] }>(
        `/api/transactions${queryString ? `?${queryString}` : ''}`,
      )
    },
  })

  return {
    ...query,
    transactions: query.data?.transactions ?? [],
    queryState: queryState(
      query.isPending,
      query.error,
      query.data?.transactions.length === 0,
    ),
  }
}

export function useReclassify() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: Category }) =>
      apiClient.patch<Transaction>(`/api/transactions/${encodeURIComponent(id)}`, { category }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: transactionKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['insights'] }),
        queryClient.invalidateQueries({ queryKey: ['analyses'] }),
      ])
    },
  })
}

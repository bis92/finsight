'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import type {
  ColumnMappingInput,
  ColumnMappingResult,
  NewTransaction,
  PdfExtractionInput,
  Upload,
} from '@/types'

export type ConfirmUploadInput =
  | { source?: 'csv'; mapping: ColumnMappingResult['mapping']; transactions: NewTransaction[] }
  | { source: 'pdf'; transactions: NewTransaction[] }

export function useMappingPreview() {
  return useMutation({
    mutationFn: (input: ColumnMappingInput) =>
      apiClient.post<ColumnMappingResult>('/api/uploads/mapping', input),
  })
}

export function useExtractPdf() {
  return useMutation({
    mutationFn: (input: PdfExtractionInput) =>
      apiClient.post<NewTransaction[]>('/api/uploads/extract', input),
  })
}

export function useUpload() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ConfirmUploadInput) =>
      apiClient.post<Upload>('/api/uploads', input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['insights'] }),
        queryClient.invalidateQueries({ queryKey: ['analyses'] }),
      ])
    },
  })
}

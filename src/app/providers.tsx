'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

import { PostHogUserSync } from '@/components/analytics/PostHogUserSync'

type ProvidersProps = Readonly<{
  children: React.ReactNode
}>

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <PostHogUserSync />
      {children}
    </QueryClientProvider>
  )
}

import { AppShell } from '@/components/ui'

import { ProReportClient } from './ProReportClient'

export default async function ProPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams
  return <AppShell><ProReportClient guest={params.guest === '1'} /></AppShell>
}

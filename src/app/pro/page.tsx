import { TopNav } from '@/components/ui'

import { ProReportClient } from './ProReportClient'

export default async function ProPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams
  return <><TopNav /><ProReportClient guest={params.guest === '1'} /></>
}

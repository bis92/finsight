import { TopNav } from '@/components/ui'

import { DashboardClient } from './DashboardClient'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ guest?: string }> }) {
  const params = await searchParams

  return (
    <>
      <TopNav />
      <DashboardClient guest={params.guest === '1'} />
    </>
  )
}

import { NextResponse } from 'next/server'

import { aggregate } from '@/lib/analysis'
import { buildFreeInsights } from '@/lib/analysis/insights'
import {
  getLlmService,
  getProfileService,
  getTransactionsRepository,
} from '@/services'

import {
  proInsightsWithFallback,
  resolveCurrentUserId,
  periodRange,
  requirePeriod,
  withErrorBoundary,
} from '../_lib/server'

export async function GET(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const period = requirePeriod(request.url)
    const userId = await resolveCurrentUserId()
    const [transactions, profile] = await Promise.all([
      getTransactionsRepository().listByUser(userId, periodRange(period)),
      getProfileService()(userId),
    ])
    const snapshot = aggregate(transactions, period)

    if (profile.plan === 'pro') {
      const { insights, aiDegraded } = await proInsightsWithFallback(getLlmService(), snapshot)
      return NextResponse.json({ period, insights, aiDegraded })
    }

    return NextResponse.json({ period, insights: buildFreeInsights(snapshot) })
  })
}

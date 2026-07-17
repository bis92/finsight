import { NextResponse } from 'next/server'

import { aggregate } from '@/lib/analysis'
import {
  getLlmService,
  getProfileService,
  getTransactionsRepository,
} from '@/services'

import {
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
    const insights = await getLlmService().generateInsights(snapshot, profile.plan)

    return NextResponse.json({ period, insights })
  })
}

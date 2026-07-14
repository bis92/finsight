import { NextResponse } from 'next/server'

import { aggregate } from '@/lib/analysis'
import {
  getLlmService,
  getProfileService,
  getTransactionsRepository,
} from '@/services'

import {
  CURRENT_USER_ID,
  periodRange,
  requirePeriod,
  withErrorBoundary,
} from '../_lib/server'

export async function GET(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const period = requirePeriod(request.url)
    const [transactions, profile] = await Promise.all([
      getTransactionsRepository().listByUser(CURRENT_USER_ID, periodRange(period)),
      getProfileService()(CURRENT_USER_ID),
    ])
    const snapshot = aggregate(transactions, period)
    const insights = await getLlmService().generateInsights(snapshot, profile.plan)

    return NextResponse.json({ period, insights })
  })
}

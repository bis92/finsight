import { NextResponse } from 'next/server'

import { aggregate } from '@/lib/analysis'
import {
  getLlmService,
  getProfileService,
  getTransactionsRepository,
} from '@/services'

import {
  ApiRouteError,
  resolveCurrentUserId,
  periodRange,
  requirePeriod,
  withErrorBoundary,
} from '../_lib/server'

export async function GET(request: Request): Promise<Response> {
  return withErrorBoundary(async () => {
    const period = requirePeriod(request.url)
    const userId = await resolveCurrentUserId()
    const profile = await getProfileService()(userId)
    if (profile.plan !== 'pro') {
      throw new ApiRouteError(403, 'Pro 전용 기능입니다')
    }

    const transactions = await getTransactionsRepository().listByUser(
      userId,
      periodRange(period),
    )
    const snapshot = aggregate(transactions, period)
    const llmService = getLlmService()
    const [insights, subscriptions] = await Promise.all([
      llmService.generateInsights(snapshot, profile.plan),
      llmService.detectSubscriptions(transactions),
    ])

    return NextResponse.json({ period, insights, subscriptions })
  })
}

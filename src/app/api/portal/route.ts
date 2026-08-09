import { NextResponse } from 'next/server'

import { getPolarClient } from '@/lib/polar/client'
import { getProfileService } from '@/services'

import { ApiRouteError, resolveCurrentUserId, withErrorBoundary } from '../_lib/server'

export async function POST(): Promise<Response> {
  return withErrorBoundary(async () => {
    const userId = await resolveCurrentUserId()
    const profile = await getProfileService()(userId)

    if (!profile.polarCustomerId) {
      throw new ApiRouteError(400, '연결된 구독 정보를 찾을 수 없습니다')
    }

    const session = await getPolarClient().customerSessions.create({
      customerId: profile.polarCustomerId,
    })

    return NextResponse.json({ url: session.customerPortalUrl })
  })
}

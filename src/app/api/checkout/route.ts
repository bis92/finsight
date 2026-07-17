import { NextResponse } from 'next/server'

import { getAuthenticatedUserId } from '@/lib/auth/session'
import { getPolarProductId, getSiteUrl } from '@/lib/env'
import { getPolarClient } from '@/lib/polar/client'
import { getProfileService } from '@/services'

import { ApiRouteError, withErrorBoundary } from '../_lib/server'

export async function POST(): Promise<Response> {
  return withErrorBoundary(async () => {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      throw new ApiRouteError(401, '로그인이 필요합니다')
    }

    const profile = await getProfileService()(userId)
    const siteUrl = new URL(getSiteUrl())
    const successUrl = new URL('/pro?checkout=success', siteUrl).toString()
    const returnUrl = new URL('/pro?checkout=cancel', siteUrl).toString()

    const checkout = await getPolarClient().checkouts.create({
      products: [getPolarProductId()],
      successUrl,
      returnUrl,
      ...(profile.polarCustomerId
        ? { customerId: profile.polarCustomerId }
        : {}),
      externalCustomerId: userId,
      metadata: { userId },
    })

    return NextResponse.json({ url: checkout.url })
  })
}

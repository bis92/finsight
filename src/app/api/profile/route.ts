import { NextResponse } from 'next/server'

import { getProfileService } from '@/services'

import { resolveCurrentUserId, withErrorBoundary } from '../_lib/server'

export async function GET(): Promise<Response> {
  return withErrorBoundary(async () => {
    const profile = await getProfileService()(await resolveCurrentUserId())
    return NextResponse.json(profile)
  })
}

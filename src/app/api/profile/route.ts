import { NextResponse } from 'next/server'

import { getProfileService } from '@/services'

import { CURRENT_USER_ID, withErrorBoundary } from '../_lib/server'

export async function GET(): Promise<Response> {
  return withErrorBoundary(async () => {
    const profile = await getProfileService()(CURRENT_USER_ID)
    return NextResponse.json(profile)
  })
}

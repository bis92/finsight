import { NextResponse } from 'next/server'

import { getDataSource } from '@/lib/env'
import { canUseStubAuth } from '@/services/stub-auth'

export async function POST(): Promise<Response> {
  if (!canUseStubAuth(getDataSource())) {
    return NextResponse.json(
      { message: '스텁 로그인은 사용할 수 없습니다' },
      { status: 403 },
    )
  }

  const response = NextResponse.json({ redirectTo: '/upload' })
  response.cookies.set('finsight_stub_session', 'mock-free-user', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  })
  return response
}

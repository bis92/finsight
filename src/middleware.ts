import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const STUB_SESSION_COOKIE = 'finsight_stub_session'

function redirectToLogin(request: NextRequest): NextResponse {
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set(
    'next',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  )
  return NextResponse.redirect(loginUrl)
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  if (
    request.nextUrl.pathname === '/dashboard'
    && request.nextUrl.searchParams.get('guest') === '1'
  ) {
    return NextResponse.next()
  }

  if ((process.env.DATA_SOURCE ?? 'mock') === 'mock') {
    return request.cookies.get(STUB_SESSION_COOKIE)?.value === 'mock-free-user'
      ? NextResponse.next()
      : redirectToLogin(request)
  }

  let response = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next()
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )
  const { data, error } = await supabase.auth.getUser()

  return error || !data.user ? redirectToLogin(request) : response
}

export const config = {
  matcher: ['/dashboard/:path*', '/upload/:path*', '/pro/:path*'],
}

import { logError } from '@/lib/observability/logger'
import { createSupabaseServerClient } from '@/lib/supabase/server-client'

const DEFAULT_DESTINATION = '/upload'
const LOGIN_FAILURE_DESTINATION = '/login?error=oauth_failed'

function getSafeDestination(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return DEFAULT_DESTINATION
  }

  return next
}

function redirect(requestUrl: URL, destination: string): Response {
  return Response.redirect(new URL(destination, requestUrl.origin))
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const providerError = requestUrl.searchParams.get('error')
  const providerErrorDescription = requestUrl.searchParams.get(
    'error_description',
  )

  if (providerError) {
    await logError('OAuth provider returned an error', {
      error: { error: providerError, description: providerErrorDescription },
      route: '/auth/callback',
    })
    return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
  }

  if (!code) {
    await logError('OAuth callback did not include an authorization code', { route: '/auth/callback' })
    return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      await logError('OAuth session exchange failed', { error, route: '/auth/callback' })
      return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
    }

    return redirect(
      requestUrl,
      getSafeDestination(requestUrl.searchParams.get('next')),
    )
  } catch (error) {
    await logError('OAuth callback failed', { error, route: '/auth/callback' })
    return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
  }
}

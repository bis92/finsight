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
    console.error('OAuth provider returned an error', {
      error: providerError,
      description: providerErrorDescription,
    })
    return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
  }

  if (!code) {
    console.error('OAuth callback did not include an authorization code')
    return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('OAuth session exchange failed', error)
      return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
    }

    return redirect(
      requestUrl,
      getSafeDestination(requestUrl.searchParams.get('next')),
    )
  } catch (error) {
    console.error('OAuth callback failed', error)
    return redirect(requestUrl, LOGIN_FAILURE_DESTINATION)
  }
}

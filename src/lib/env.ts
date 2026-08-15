import 'server-only'

export type DataSource = 'mock' | 'live'

export function getDataSource(): DataSource {
  const dataSource = process.env.DATA_SOURCE ?? 'mock'

  if (dataSource !== 'mock' && dataSource !== 'live') {
    throw new Error('DATA_SOURCE must be either "mock" or "live"')
  }

  return dataSource
}

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

export function getSupabaseUrl(): string {
  return getRequiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_URL')
}

export function getSupabaseAnonKey(): string {
  return getRequiredEnvironmentVariable('NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export function getSupabaseServiceRoleKey(): string {
  return getRequiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY')
}

export function getAnthropicApiKey(): string {
  return getRequiredEnvironmentVariable('ANTHROPIC_API_KEY')
}

export function getPolarAccessToken(): string {
  return getRequiredEnvironmentVariable('POLAR_ACCESS_TOKEN')
}

export function getPolarWebhookSecret(): string {
  return getRequiredEnvironmentVariable('POLAR_WEBHOOK_SECRET')
}

export function getPolarProductId(): string {
  return getRequiredEnvironmentVariable('POLAR_PRODUCT_ID')
}

export type PolarServer = 'sandbox' | 'production'

export function getPolarServer(): PolarServer {
  const server = process.env.POLAR_SERVER ?? 'production'

  if (server !== 'sandbox' && server !== 'production') {
    throw new Error('POLAR_SERVER must be either "sandbox" or "production"')
  }

  return server
}

export function getSiteUrl(): string {
  return getRequiredEnvironmentVariable('NEXT_PUBLIC_SITE_URL')
}

export function getPosthogToken(): string | null {
  return process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? null
}

export function getPosthogHost(): string {
  return process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
}

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  getAnthropicApiKey,
  getDataSource,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from '@/lib/env'

const originalDataSource = process.env.DATA_SOURCE
const supabaseEnvironment = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

describe('getDataSource', () => {
  afterEach(() => {
    if (originalDataSource === undefined) {
      delete process.env.DATA_SOURCE
      return
    }

    process.env.DATA_SOURCE = originalDataSource
  })

  it('returns mock when DATA_SOURCE is not set', () => {
    delete process.env.DATA_SOURCE

    expect(getDataSource()).toBe('mock')
  })
})

describe.each([
  ['ANTHROPIC_API_KEY', getAnthropicApiKey],
  ['NEXT_PUBLIC_SUPABASE_URL', getSupabaseUrl],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', getSupabaseAnonKey],
  ['SUPABASE_SERVICE_ROLE_KEY', getSupabaseServiceRoleKey],
] as const)('%s accessor', (environmentVariable, accessor) => {
  afterEach(() => {
    const originalValue = supabaseEnvironment[environmentVariable]

    if (originalValue === undefined) {
      delete process.env[environmentVariable]
      return
    }

    process.env[environmentVariable] = originalValue
  })

  it('returns the configured value', () => {
    process.env[environmentVariable] = 'configured-value'

    expect(accessor()).toBe('configured-value')
  })

  it.each([undefined, ''])('throws when the value is not set (%s)', (value) => {
    if (value === undefined) {
      delete process.env[environmentVariable]
    } else {
      process.env[environmentVariable] = value
    }

    expect(accessor).toThrow(`${environmentVariable} is not set`)
  })
})

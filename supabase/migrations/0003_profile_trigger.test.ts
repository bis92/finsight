import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/0003_profile_trigger.sql',
)

describe('0003 profile provisioning migration', () => {
  it('provisions one free profile securely after an auth user is inserted', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toMatch(/security\s+definer/i)
    expect(sql).toMatch(/set\s+search_path\s*=\s*public/i)
    expect(sql).toMatch(/insert\s+into\s+public\.profiles\s*\(\s*id\s*,\s*plan\s*\)/i)
    expect(sql).toMatch(/values\s*\(\s*new\.id\s*,\s*'free'\s*\)/i)
    expect(sql).toMatch(/on\s+conflict\s*\(\s*id\s*\)\s+do\s+nothing/i)
    expect(sql).toMatch(
      /after\s+insert\s+on\s+auth\.users[\s\S]*for\s+each\s+row[\s\S]*execute\s+function/i,
    )
  })
})

import type { DataSource } from '@/lib/env'

export function canUseStubAuth(dataSource: DataSource): boolean {
  return dataSource === 'mock'
}

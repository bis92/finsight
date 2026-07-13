// Server-only service factory. Import this module only from Route Handlers or Server Actions.
import 'server-only'

import { getDataSource } from '@/lib/env'

import { mockLlmService } from './mock/llm'
import { getMockProfile } from './mock/profile'
import { mockTransactionsRepository } from './mock/transactions'
import { listMockUploadsByUser } from './mock/uploads'
import type { LlmService, TransactionsRepository } from './types'

function assertMockDataSource(): void {
  if (getDataSource() === 'live') {
    throw new Error('live not implemented')
  }
}

export function getTransactionsRepository(): TransactionsRepository {
  assertMockDataSource()
  return mockTransactionsRepository
}

export function getLlmService(): LlmService {
  assertMockDataSource()
  return mockLlmService
}

export function getProfileService(): typeof getMockProfile {
  assertMockDataSource()
  return getMockProfile
}

export function getUploadsService(): typeof listMockUploadsByUser {
  assertMockDataSource()
  return listMockUploadsByUser
}

export type { LlmService, TransactionsRepository } from './types'

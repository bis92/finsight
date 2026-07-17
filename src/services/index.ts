// Server-only service factory. Import this module only from Route Handlers or Server Actions.
import 'server-only'

import { getDataSource } from '@/lib/env'

import { getProfile } from './live/profile'
import { liveTransactionsRepository } from './live/transactions'
import { listUploadsByUser } from './live/uploads'
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
  return getDataSource() === 'live'
    ? liveTransactionsRepository
    : mockTransactionsRepository
}

export function getLlmService(): LlmService {
  assertMockDataSource()
  return mockLlmService
}

export function getProfileService(): typeof getMockProfile {
  return getDataSource() === 'live' ? getProfile : getMockProfile
}

export function getUploadsService(): typeof listMockUploadsByUser {
  return getDataSource() === 'live'
    ? listUploadsByUser
    : listMockUploadsByUser
}

export type { LlmService, TransactionsRepository } from './types'

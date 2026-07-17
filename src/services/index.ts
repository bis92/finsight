// Server-only service factory. Import this module only from Route Handlers or Server Actions.
import 'server-only'

import { getDataSource } from '@/lib/env'

import { liveLlmService } from './live/llm'
import { getProfile } from './live/profile'
import { liveTransactionsRepository } from './live/transactions'
import { listUploadsByUser } from './live/uploads'
import { mockLlmService } from './mock/llm'
import { getMockProfile } from './mock/profile'
import { mockTransactionsRepository } from './mock/transactions'
import { listMockUploadsByUser } from './mock/uploads'
import type { LlmService, TransactionsRepository } from './types'

// getDataSource() already fails closed on any value other than 'mock' | 'live',
// so the union is exhaustive here — no unreachable default branch needed.
function selectDataSource<T>(mockService: T, liveService: T): T {
  return getDataSource() === 'live' ? liveService : mockService
}

export function getTransactionsRepository(): TransactionsRepository {
  return selectDataSource(mockTransactionsRepository, liveTransactionsRepository)
}

export function getLlmService(): LlmService {
  return selectDataSource(mockLlmService, liveLlmService)
}

export function getProfileService(): typeof getMockProfile {
  return selectDataSource(getMockProfile, getProfile)
}

export function getUploadsService(): typeof listMockUploadsByUser {
  return selectDataSource(listMockUploadsByUser, listUploadsByUser)
}

export type { LlmService, TransactionsRepository } from './types'

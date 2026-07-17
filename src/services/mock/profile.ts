// Server-only data implementation. Import through src/services/index.ts from Route Handlers.
import 'server-only'

import type { Profile } from '@/types'

import { MOCK_FREE_PROFILE, MOCK_PRO_PROFILE } from './fixtures/profiles'

export async function getMockProfile(userId: string): Promise<Profile> {
  const fixture = userId === MOCK_PRO_PROFILE.id ? MOCK_PRO_PROFILE : MOCK_FREE_PROFILE
  return { ...fixture, id: userId }
}

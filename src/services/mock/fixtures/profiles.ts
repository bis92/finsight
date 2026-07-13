import type { Profile } from '@/types'

export const MOCK_FREE_PROFILE: Profile = {
  id: 'mock-free-user',
  plan: 'free',
  polarSubscriptionId: null,
  polarCustomerId: null,
}

export const MOCK_PRO_PROFILE: Profile = {
  id: 'mock-pro-user',
  plan: 'pro',
  polarSubscriptionId: 'mock-subscription-pro',
  polarCustomerId: 'mock-customer-pro',
}

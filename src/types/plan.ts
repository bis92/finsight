export type Plan = 'free' | 'pro'

export type Profile = {
  id: string
  plan: Plan
  polarSubscriptionId?: string | null
  polarCustomerId?: string | null
}

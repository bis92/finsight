import { validateEvent } from '@polar-sh/sdk/webhooks'
import { NextResponse } from 'next/server'

import { getPolarWebhookSecret } from '@/lib/polar/client'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role-client'

const ACTIVE_EVENT_TYPES = new Set([
  'subscription.created',
  'subscription.active',
  'order.paid',
])

// Polar emits `subscription.canceled` when cancellation is scheduled, while the
// subscription remains entitled through the current period. `subscription.uncanceled`
// reverses that schedule, and `subscription.past_due` can still recover during retries.
// Only `subscription.revoked` means access has actually ended (including exhausted
// payment retries), so that is the sole downgrade trigger.
const TERMINATED_EVENT_TYPES = new Set(['subscription.revoked'])

type PlanEventData = {
  id?: string
  customerId?: string
  subscriptionId?: string | null
  metadata?: Record<string, unknown>
  customer?: { externalId?: string | null }
}

type PlanEvent = {
  type: string
  data: PlanEventData
}

function headerRecord(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries())
}

function mappedUserId(data: PlanEventData): string | null {
  const metadataUserId = data.metadata?.userId
  if (typeof metadataUserId === 'string' && metadataUserId.length > 0) {
    return metadataUserId
  }

  const externalId = data.customer?.externalId
  return typeof externalId === 'string' && externalId.length > 0
    ? externalId
    : null
}

function polarIds(event: PlanEvent): {
  customerId: string | null
  subscriptionId: string | null
} {
  const customerId = typeof event.data.customerId === 'string'
    ? event.data.customerId
    : null
  const subscriptionId = event.type.startsWith('subscription.')
    ? (typeof event.data.id === 'string' ? event.data.id : null)
    : (typeof event.data.subscriptionId === 'string'
        ? event.data.subscriptionId
        : null)

  return { customerId, subscriptionId }
}

async function findUserByPolarIds(
  customerId: string | null,
  subscriptionId: string | null,
): Promise<string | null> {
  const client = createSupabaseServiceRoleClient()
  const candidates: Array<['polar_customer_id' | 'polar_subscription_id', string]> = []
  if (customerId) candidates.push(['polar_customer_id', customerId])
  if (subscriptionId) candidates.push(['polar_subscription_id', subscriptionId])

  for (const [column, value] of candidates) {
    const { data, error } = await client
      .from('profiles')
      .select('id')
      .eq(column, value)
      .maybeSingle()

    if (error) throw error
    if (data) return data.id
  }

  return null
}

async function resolveUserId(event: PlanEvent): Promise<string | null> {
  const { customerId, subscriptionId } = polarIds(event)
  return mappedUserId(event.data)
    ?? await findUserByPolarIds(customerId, subscriptionId)
}

async function activatePlan(event: PlanEvent): Promise<void> {
  const { customerId, subscriptionId } = polarIds(event)
  const userId = await resolveUserId(event)

  if (!userId) {
    console.warn('Polar webhook user mapping was not found')
    return
  }

  const { error } = await createSupabaseServiceRoleClient()
    .from('profiles')
    .update({
      plan: 'pro',
      polar_customer_id: customerId,
      polar_subscription_id: subscriptionId,
    })
    .eq('id', userId)

  if (error) throw error
}

async function deactivatePlan(event: PlanEvent): Promise<void> {
  const userId = await resolveUserId(event)

  if (!userId) {
    console.warn('Polar webhook user mapping was not found')
    return
  }

  // Setting the target state (rather than toggling it) makes webhook retries safe.
  const { error } = await createSupabaseServiceRoleClient()
    .from('profiles')
    .update({ plan: 'free' })
    .eq('id', userId)

  if (error) throw error
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text()
  let event: PlanEvent
  let secret: string

  try {
    secret = getPolarWebhookSecret()
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { message: '일시적인 오류가 발생했습니다' },
      { status: 500 },
    )
  }

  try {
    event = validateEvent(rawBody, headerRecord(request.headers), secret) as PlanEvent
  } catch (error) {
    console.warn('Polar webhook signature verification failed', error)
    return NextResponse.json(
      { message: '웹훅 서명이 유효하지 않습니다' },
      { status: 401 },
    )
  }

  try {
    if (ACTIVE_EVENT_TYPES.has(event.type)) {
      await activatePlan(event)
    } else if (TERMINATED_EVENT_TYPES.has(event.type)) {
      await deactivatePlan(event)
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error(error)
    return NextResponse.json(
      { message: '일시적인 오류가 발생했습니다' },
      { status: 500 },
    )
  }
}

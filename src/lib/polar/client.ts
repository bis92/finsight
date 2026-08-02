import 'server-only'

import { Polar } from '@polar-sh/sdk'

import {
  getPolarAccessToken,
  getPolarServer,
  getPolarWebhookSecret,
} from '@/lib/env'

let polarClient: Polar | undefined

export { getPolarAccessToken, getPolarWebhookSecret }

export function getPolarClient(): Polar {
  if (!polarClient) {
    polarClient = new Polar({
      accessToken: getPolarAccessToken(),
      server: getPolarServer(),
    })
  }

  return polarClient
}

import {
  FREE_UPLOAD_CAP_MESSAGE,
  getUtcMonthRange,
  isUploadAllowed,
} from '@/lib/upload-cap'
import { getProfileService } from '@/services'
import { countUploadsInRange } from '@/services/live/uploads'

import { ApiRouteError } from './server'

/**
 * ADR-006: cost safety-valve for live paths that incur real LLM spend (CSV
 * parse+insert, PDF extraction). Trusts only the server `profiles.plan` that the
 * Polar webhook maintains — never a client-supplied plan.
 */
export async function enforceLiveUploadCap(userId: string, now: Date): Promise<void> {
  const profile = await getProfileService()(userId)
  if (profile.plan === 'pro') {
    return
  }

  const { start, end } = getUtcMonthRange(now)
  const uploadsThisMonth = await countUploadsInRange(
    userId,
    start.toISOString(),
    end.toISOString(),
  )
  if (!isUploadAllowed({ plan: profile.plan, uploadsThisMonth })) {
    throw new ApiRouteError(402, FREE_UPLOAD_CAP_MESSAGE)
  }
}

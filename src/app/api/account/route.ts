import { NextResponse } from 'next/server'

import { getAuthenticatedUserId } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/server-client'
import { removeObjects } from '@/lib/supabase/storage'

import { ApiRouteError, withErrorBoundary } from '../_lib/server'

const USER_DATA_TABLES = [
  'transactions',
  'analyses',
  'subscriptions',
  'uploads',
] as const

export async function DELETE(): Promise<Response> {
  return withErrorBoundary(async () => {
    const userId = await getAuthenticatedUserId()
    if (!userId) {
      throw new ApiRouteError(401, '인증이 필요합니다')
    }

    let completedStage = 'authentication'

    try {
      const client = await createSupabaseServerClient()
      const { data: uploads, error: uploadsError } = await client
        .from('uploads')
        .select('file_path')
        .eq('user_id', userId)

      if (uploadsError) {
        throw uploadsError
      }

      const ownedPrefix = `${userId}/`
      const paths = uploads.map(({ file_path: path }) => {
        if (!path.startsWith(ownedPrefix)) {
          throw new Error('Upload path ownership mismatch')
        }
        return path
      })

      await removeObjects(paths)
      completedStage = 'storage originals'

      for (const table of USER_DATA_TABLES) {
        const { error } = await client
          .from(table)
          .delete()
          .eq('user_id', userId)

        if (error) {
          throw error
        }
        completedStage = `${table} rows`
      }

      // profiles remains while the Supabase Auth identity remains. Deleting the
      // Auth user requires an admin/service-role call and is outside this data-only
      // step; the auth.users cascade owns profile deletion when that policy lands.
      return new NextResponse(null, { status: 204 })
    } catch (error) {
      console.error(`Account data deletion failed after ${completedStage}`, error)
      throw error
    }
  })
}

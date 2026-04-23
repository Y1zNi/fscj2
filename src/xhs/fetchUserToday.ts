import {
  handleXhsUserTodayResponse,
  type XhsUserTodayPosts,
} from './handleUserToday'
import type { DateScope } from '../douyin/fetchUserToday'

const API = '/api/xhs-user-today'

export async function fetchXhsUserTodayPosts(
  profileUrl: string,
  cookie: string,
  dateScope: DateScope,
): Promise<XhsUserTodayPosts> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileUrl: profileUrl.trim(),
      cookie: cookie.trim(),
      dateScope,
    }),
  })
  const payload = (await res.json()) as {
    ok: boolean
    message?: string
    data?: unknown
  }
  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || `请求失败 HTTP ${res.status}`)
  }
  return handleXhsUserTodayResponse(payload.data)
}

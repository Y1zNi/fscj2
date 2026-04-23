import {
  handleYicheUserTodayResponse,
  type YicheUserTodayPosts,
} from './handleUserToday'
import type { DateScope } from '../douyin/fetchUserToday'

const API = '/api/yiche-user-today'

export async function fetchYicheUserTodayPosts(
  profileUrl: string,
  dateScope: DateScope,
): Promise<YicheUserTodayPosts> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileUrl: profileUrl.trim(),
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
  return handleYicheUserTodayResponse(payload.data)
}

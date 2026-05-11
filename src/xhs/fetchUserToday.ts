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
  /** 为 true 时才请求 otherinfo（飞书映射了粉丝列时需要回填） */
  includeFans = false,
): Promise<XhsUserTodayPosts> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileUrl: profileUrl.trim(),
      cookie: cookie.trim(),
      dateScope,
      includeFans,
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

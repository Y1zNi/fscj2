import {
  handleXhsUserTodayResponse,
  type XhsUserTodayPosts,
} from './handleUserToday'

const API = '/api/xhs-user-today'

export async function fetchXhsUserTodayPosts(
  profileUrl: string,
  cookie: string,
): Promise<XhsUserTodayPosts> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileUrl: profileUrl.trim(),
      cookie: cookie.trim(),
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

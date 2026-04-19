import {
  handleDongchediUserTodayResponse,
  type DongchediUserTodayPosts,
} from './handleUserToday'

const API = '/api/dongchedi-user-today'

export async function fetchDongchediUserTodayPosts(
  profileUrl: string,
): Promise<DongchediUserTodayPosts> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileUrl: profileUrl.trim(),
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
  return handleDongchediUserTodayResponse(payload.data)
}

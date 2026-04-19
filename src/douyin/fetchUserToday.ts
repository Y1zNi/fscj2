import {
  handleDouyinUserTodayResponse,
  type DouyinUserTodayPosts,
} from './handleUserToday'

const DETAIL_API = '/api/douyin-user-today'

export async function fetchDouyinUserTodayPosts(
  userUrl: string,
  cookie: string,
): Promise<DouyinUserTodayPosts> {
  const res = await fetch(DETAIL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userUrl: userUrl.trim(), cookie: cookie.trim() }),
  })
  const payload = (await res.json()) as {
    ok: boolean
    message?: string
    data?: unknown
  }
  if (!payload.ok || !payload.data) {
    throw new Error(payload.message || `请求失败 HTTP ${res.status}`)
  }
  return handleDouyinUserTodayResponse(payload.data)
}

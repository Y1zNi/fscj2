import {
  handleDongchediArticleResponse,
  type DongchediArticleStats,
} from './handleArticleStats'

const API = '/api/dongchedi-article'

export type FetchDongchediArticleOptions = {
  /** 默认 true；为 false 时不请求作者主页，仅用文章页粉丝 */
  includeFans?: boolean
}

export async function fetchDongchediArticleStats(
  articleUrl: string,
  opts?: FetchDongchediArticleOptions,
): Promise<DongchediArticleStats> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: articleUrl.trim(),
      includeFans: opts?.includeFans,
    }),
  })
  let payload: unknown
  try {
    payload = await res.json()
  } catch {
    throw new Error(`懂车帝请求异常 HTTP ${res.status}`)
  }
  return handleDongchediArticleResponse(payload)
}

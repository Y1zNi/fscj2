/**
 * 不发起网络请求即可判定：是否为抖音「用户主页」链接。
 */
export function isObviousDouyinUserUrl(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  const lower = s.toLowerCase()
  if (!/\bdouyin\.com\b/.test(lower)) return false
  return /\/user\/[^/?#]+/.test(lower)
}

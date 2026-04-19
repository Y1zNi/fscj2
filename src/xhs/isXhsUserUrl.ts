/**
 * 不发起请求即可判定：是否为小红书用户主页链接（用于 user_posted）。
 * 建议从浏览器复制完整 URL（含 xsec_token），否则接口可能失败。
 */
export function isObviousXhsUserUrl(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  const lower = s.toLowerCase()
  if (!/\bxiaohongshu\.com\b/.test(lower)) return false
  if (/\/explore\//.test(lower) || /\/discovery\/item\//.test(lower)) {
    return false
  }
  if (/\/user\/profile\/[^/?\s#]+/.test(lower)) return true
  if (/\/user\/[^/?\s#]+\b/.test(lower) && !/\/user\/self\b/.test(lower)) {
    return true
  }
  return false
}

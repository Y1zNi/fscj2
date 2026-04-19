/**
 * 汽车之家作者入口（与插件抓取一致）
 * - 个人主页：`https://i.autohome.com.cn/{uid}`、`https://i.m.autohome.com.cn/{uid}`（可带 #、?）
 * - 论坛主帖列表：`…/{uid}/club/topic`
 */
export function isObviousAutohomeAuthorUrl(url: string): boolean {
  const s = url.trim()
  if (!s.toLowerCase().includes('autohome.com.cn')) return false
  try {
    const normalized = /^https?:\/\//i.test(s) ? s : `https://${s}`
    const u = new URL(normalized)
    const host = u.hostname.toLowerCase()
    if (!host.endsWith('autohome.com.cn')) return false
    if (/\/\d+\/club\/topic/i.test(`${u.pathname}${u.search}`)) return true
    if (host === 'i.autohome.com.cn' || host === 'i.m.autohome.com.cn') {
      return /^\/\d+\/?$/.test(u.pathname)
    }
    return false
  } catch {
    return /\/\d+\/club\/topic/i.test(s)
  }
}

export function isObviousYichePageUrl(url: string): boolean {
  const raw = url.trim()
  if (!raw) return false
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    const h = u.hostname.toLowerCase()
    if (h !== 'i.yiche.com' && h !== 'i.m.yiche.com') return false
    const p = u.pathname.toLowerCase()
    // PC 个人中心各 Tab：!all、!article、!video/publish、!koubei/topic、!forum/t1 等
    if (/^\/u\d+\/!.+/.test(p)) return true
    if (/^\/u\d+\/?$/.test(p)) return true
    if (/^\/u\d+\/newcenter\/!forum\/topics\/?$/.test(p)) return true
    return false
  } catch {
    return false
  }
}

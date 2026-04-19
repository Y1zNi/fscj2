export function isObviousDongchediArticleUrl(url: string): boolean {
  const raw = url.trim()
  if (!raw) return false
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    const h = u.hostname.toLowerCase()
    if (!h.includes('dongchedi.com')) return false
    const p = u.pathname.toLowerCase()
    if (/^\/user\/all\/\d+\/?$/.test(p)) return true
    if (/^\/user\/\d+\/?$/.test(p)) return true
    return false
  } catch {
    return false
  }
}

export interface XhsTodayPostItem {
  noteId: string
  noteUrl: string
  desc: string
  createTime: number
  noteType: string
}

interface XhsUserTodayRawPayload {
  userId?: string
  profileUrl?: string
  todayPosts?: unknown
  /** otherinfo 解析的粉丝数；拿不到时为 null */
  fansCount?: number | null
}

export interface XhsUserTodayPosts {
  userId: string
  profileUrl: string
  todayPosts: XhsTodayPostItem[]
  fansCount: number | null
}

export function handleXhsUserTodayResponse(json: unknown): XhsUserTodayPosts {
  const j = json as XhsUserTodayRawPayload
  const userId = String(j.userId || '').trim()
  const profileUrl = String(j.profileUrl || '').trim()
  const fcRaw = j.fansCount
  const fansCount =
    fcRaw != null && Number.isFinite(Number(fcRaw)) ? Number(fcRaw) : null
  const list = Array.isArray(j.todayPosts) ? j.todayPosts : []
  const todayPosts: XhsTodayPostItem[] = []
  for (const one of list) {
    const item = one as Partial<XhsTodayPostItem>
    const noteId = String(item.noteId || '').trim()
    const noteUrl = String(item.noteUrl || '').trim()
    if (!noteId || !noteUrl) continue
    todayPosts.push({
      noteId,
      noteUrl,
      desc: String(item.desc || ''),
      createTime: Number(item.createTime || 0),
      noteType: String(item.noteType || '图文'),
    })
  }
  return {
    userId,
    profileUrl,
    todayPosts,
    fansCount,
  }
}

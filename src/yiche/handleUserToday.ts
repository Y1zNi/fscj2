export interface YicheTodayPostItem {
  postId: string
  postUrl: string
  title: string
  bodyText: string
  postAtText: string
  contentType: string
}

interface YicheUserTodayRawPayload {
  userId?: string
  profileUrl?: string
  todayPosts?: unknown
}

export interface YicheUserTodayPosts {
  userId: string
  profileUrl: string
  todayPosts: YicheTodayPostItem[]
}

export function handleYicheUserTodayResponse(json: unknown): YicheUserTodayPosts {
  const j = json as YicheUserTodayRawPayload
  const userId = String(j.userId || '').trim()
  const profileUrl = String(j.profileUrl || '').trim()
  const list = Array.isArray(j.todayPosts) ? j.todayPosts : []
  const todayPosts: YicheTodayPostItem[] = []
  for (const one of list) {
    const item = one as Partial<YicheTodayPostItem>
    const postId = String(item.postId || '').trim()
    const postUrl = String(item.postUrl || '').trim()
    if (!postId || !postUrl) continue
    todayPosts.push({
      postId,
      postUrl,
      title: String(item.title || ''),
      bodyText: String(item.bodyText || item.title || ''),
      postAtText: String(item.postAtText || ''),
      contentType: String(item.contentType || ''),
    })
  }
  return {
    userId,
    profileUrl,
    todayPosts,
  }
}

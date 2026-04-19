export interface DongchediTodayPostItem {
  articleId: string
  articleUrl: string
  title: string
  bodyText: string
  createTime: number
  contentType: string
}

interface DongchediUserTodayRawPayload {
  userId?: string
  profileUrl?: string
  todayPosts?: unknown
}

export interface DongchediUserTodayPosts {
  userId: string
  profileUrl: string
  todayPosts: DongchediTodayPostItem[]
}

export function handleDongchediUserTodayResponse(
  json: unknown,
): DongchediUserTodayPosts {
  const j = json as DongchediUserTodayRawPayload
  const userId = String(j.userId || '').trim()
  const profileUrl = String(j.profileUrl || '').trim()
  const list = Array.isArray(j.todayPosts) ? j.todayPosts : []
  const todayPosts: DongchediTodayPostItem[] = []
  for (const one of list) {
    const item = one as Partial<DongchediTodayPostItem>
    const articleId = String(item.articleId || '').trim()
    const articleUrl = String(item.articleUrl || '').trim()
    if (!articleId || !articleUrl) continue
    todayPosts.push({
      articleId,
      articleUrl,
      title: String(item.title || ''),
      bodyText: String(item.bodyText || item.title || ''),
      createTime: Number(item.createTime || 0),
      contentType: String(item.contentType || '文章'),
    })
  }
  return {
    userId,
    profileUrl,
    todayPosts,
  }
}

export interface AutohomeTodayPostItem {
  topicId: string
  threadUrl: string
  /** 详情页标题（可能与列表摘要不同） */
  title: string
  /** 详情正文（由 mainTopic.t_content 去 HTML；失败时为列表标题） */
  bodyText: string
  postAtText: string
  topicType: string
  bbsName: string
}

interface AutohomeUserTodayRawPayload {
  uid?: string
  profileUrl?: string
  todayPosts?: unknown
}

export interface AutohomeUserTodayPosts {
  uid: string
  profileUrl: string
  todayPosts: AutohomeTodayPostItem[]
}

export function handleAutohomeUserTodayResponse(
  json: unknown,
): AutohomeUserTodayPosts {
  const j = json as AutohomeUserTodayRawPayload
  const uid = String(j.uid || '').trim()
  const profileUrl = String(j.profileUrl || '').trim()
  const list = Array.isArray(j.todayPosts) ? j.todayPosts : []
  const todayPosts: AutohomeTodayPostItem[] = []
  for (const one of list) {
    const item = one as Partial<AutohomeTodayPostItem>
    const topicId = String(item.topicId || '').trim()
    const threadUrl = String(item.threadUrl || '').trim()
    if (!topicId || !threadUrl) {
      continue
    }
    todayPosts.push({
      topicId,
      threadUrl,
      title: String(item.title || ''),
      bodyText: String(item.bodyText || item.title || ''),
      postAtText: String(item.postAtText || ''),
      topicType: String(item.topicType || ''),
      bbsName: String(item.bbsName || ''),
    })
  }
  return {
    uid,
    profileUrl,
    todayPosts,
  }
}

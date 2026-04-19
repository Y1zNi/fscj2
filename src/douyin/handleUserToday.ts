export interface DouyinTodayPostItem {
  awemeId: string
  workUrl: string
  desc: string
  createTime: number
  workType: 'video' | 'note'
}

interface DouyinTodayRawPayload {
  secUserId?: string
  todayPosts?: unknown
}

export interface DouyinUserTodayPosts {
  secUserId: string
  todayPosts: DouyinTodayPostItem[]
}

export function handleDouyinUserTodayResponse(
  json: unknown,
): DouyinUserTodayPosts {
  const j = json as DouyinTodayRawPayload
  const secUserId = String(j.secUserId || '').trim()
  const list = Array.isArray(j.todayPosts) ? j.todayPosts : []
  const todayPosts: DouyinTodayPostItem[] = []
  for (const one of list) {
    const item = one as Partial<DouyinTodayPostItem>
    const awemeId = String(item.awemeId || '').trim()
    const workUrl = String(item.workUrl || '').trim()
    if (!awemeId || !workUrl) continue
    const workType = item.workType === 'note' ? 'note' : 'video'
    todayPosts.push({
      awemeId,
      workUrl,
      desc: String(item.desc || ''),
      createTime: Number(item.createTime || 0),
      workType,
    })
  }
  return {
    secUserId,
    todayPosts,
  }
}

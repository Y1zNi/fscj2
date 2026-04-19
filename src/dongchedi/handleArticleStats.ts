export interface DongchediArticleStats {
  articleUrl: string
  screenName: string | null
  fans: number | string | null
  watchCount: number | string | null
  haveEssence: boolean | null
  haveEssenceLabel: string | null
  authorUserId: string | null
  koubeiCarModel: string | null
  koubeiTotalScore: string | null
  koubeiDimensionScores: string | null
}

interface ApiPayload {
  ok: boolean
  message?: string
  data?: DongchediArticleStats
}

export function handleDongchediArticleResponse(json: unknown): DongchediArticleStats {
  const j = json as ApiPayload
  if (!j.ok || !j.data) {
    throw new Error(j.message || '懂车帝接口失败')
  }
  return j.data
}

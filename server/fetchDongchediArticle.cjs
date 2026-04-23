'use strict'

const { sleepRandomCarBetweenRequestsMs } = require('./sleepBetweenRequests.cjs')

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

const NEXT_DATA_RE = /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i

const CAR_VIEW_KEYS = [
  ['appearance_score', '外观'],
  ['configuration_score', '配置'],
  ['interiors_score', '内饰'],
  ['space_score', '空间'],
  ['oil_consumption_score', '油耗'],
  ['comfort_score', '舒适'],
  ['power_score', '动力'],
  ['control_score', '操控'],
  ['driving_score', '驾驶'],
  ['intelligence_score', '智能'],
  ['smart_cockpit_score', '智能座舱'],
  ['assist_driving_score', '辅助驾驶'],
  ['continuation_score', '续航'],
  ['power_control_score', '动力操控'],
]

/** 明细回填：文章页用 PC Web（抓取详情仍用 m 站） */
function toDongchediWebArticleUrl(articleId) {
  const id = String(articleId || '').trim()
  if (!id) return ''
  return `https://www.dongchedi.com/article/${id}`
}

function toH5ArticleUrl(url) {
  let u = String(url || '').trim()
  if (!u) return u
  try {
    const p = new URL(u.startsWith('http') ? u : 'https://' + u)
    const host = p.hostname.toLowerCase()
    if (!host.includes('dongchedi.com')) return u
    let pathname = p.pathname
    let netloc = p.host
    if (host === 'www.dongchedi.com' || host === 'dongchedi.com') {
      netloc = 'm.dongchedi.com'
    }
    const homeM = pathname.match(/^\/user\/all\/(\d+)\/?$/i)
    if (homeM) {
      pathname = `/user/${homeM[1]}`
    }
    return `${p.protocol}//${netloc}${pathname}${p.search}`
  } catch {
    return u
  }
}

function parseDongchediUrlType(url) {
  try {
    const p = new URL(url)
    const path = p.pathname.toLowerCase()
    if (/^\/user\/\d+\/?$/.test(path)) return 'user'
    if (/^\/user\/all\/\d+\/?$/.test(path)) return 'user'
  } catch {
    // noop
  }
  return 'article'
}

function normalizeDongchediUserUrl(url) {
  const h5Url = toH5ArticleUrl(url)
  const p = new URL(h5Url)
  const m = p.pathname.match(/^\/user\/(\d+)\/?$/i)
  if (!m) {
    throw new Error('请使用懂车帝用户主页链接（/user/all/{id} 或 /user/{id}）')
  }
  return {
    userId: m[1],
    userUrl: `${p.protocol}//${p.host}/user/${m[1]}`,
  }
}

function centisToScoreStr(n) {
  if (n == null) return null
  let x
  try {
    x = parseInt(String(n), 10)
  } catch {
    return null
  }
  if (Number.isNaN(x)) return null
  return (x / 100).toFixed(2)
}

function parseCarViewBundle(carView) {
  const empty = {
    koubeiCarModel: null,
    koubeiTotalScore: null,
    koubeiDimensionScores: null,
  }
  if (!carView || typeof carView !== 'object') return empty

  const sn = carView.series_name
  const model =
    sn != null && String(sn).trim() ? String(sn).trim() : null

  const scoreS = centisToScoreStr(carView.score)
  const lev = carView.score_level
  const levS = lev != null && String(lev).trim() ? String(lev).trim() : ''
  let total = null
  if (scoreS && levS) total = `${scoreS}（${levS}）`
  else if (scoreS) total = scoreS
  else if (levS) total = levS

  const parts = []
  for (const [key, label] of CAR_VIEW_KEYS) {
    const raw = carView[key]
    if (raw == null) continue
    let iv = parseInt(String(raw), 10)
    if (Number.isNaN(iv) || iv <= 0) continue
    const ds = centisToScoreStr(iv)
    if (ds) parts.push(`${label}${ds}`)
  }
  const dims = parts.length ? parts.join('；') : null

  return {
    koubeiCarModel: model,
    koubeiTotalScore: total,
    koubeiDimensionScores: dims,
  }
}

function pickHaveEssence(obj) {
  if (!obj || typeof obj !== 'object' || !('have_essence' in obj)) return null
  const v = obj.have_essence
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Boolean(v)
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === '1' || s === 'true' || s === 'yes') return true
    if (s === '0' || s === 'false' || s === 'no') return false
  }
  return null
}

function authorUserIdFromMotorProfile(mpi) {
  if (!mpi || typeof mpi !== 'object') return null
  const s = mpi.user_id_str
  if (typeof s === 'string' && s.trim()) return s.trim()
  const u = mpi.user_id
  if (u == null) return null
  const t = String(u).trim()
  return t || null
}

function parsePagePropsStats(nextData) {
  const emptyArticle = {
    screenName: null,
    fansCount: null,
    watchCount: null,
    haveEssence: null,
    authorUserId: null,
    ...parseCarViewBundle(null),
  }
  const pp = (nextData.props && nextData.props.pageProps) || {}
  const detail = pp.articleDetail
  if (
    !detail ||
    typeof detail !== 'object' ||
    Object.keys(detail).length === 0
  ) {
    return { ...emptyArticle }
  }
  const core =
    detail.data && typeof detail.data === 'object' ? detail.data : detail
  const mpi =
    core.motor_profile_info && typeof core.motor_profile_info === 'object'
      ? core.motor_profile_info
      : {}
  const cv = core.car_view
  const kb = parseCarViewBundle(
    cv && typeof cv === 'object' ? cv : null,
  )
  return {
    screenName: mpi.name != null ? mpi.name : null,
    fansCount: mpi.fans_count != null ? mpi.fans_count : null,
    watchCount: core.read_count != null ? core.read_count : null,
    haveEssence: pickHaveEssence(core),
    authorUserId: authorUserIdFromMotorProfile(mpi),
    ...kb,
  }
}

function parseUserHomeFansNum(nextData) {
  const pp = (nextData.props && nextData.props.pageProps) || {}
  const ui = pp.userInfo
  if (!ui || typeof ui !== 'object') return null
  const info = ui.info
  if (!info || typeof info !== 'object') return null
  const n = info.fans_num
  if (typeof n === 'boolean') return null
  if (typeof n === 'number' && !Number.isNaN(n)) return Math.floor(n)
  if (typeof n === 'string' && /^\d+$/.test(n.trim())) return parseInt(n.trim(), 10)
  return null
}

function parseUserHomeScreenName(nextData) {
  const pp = (nextData.props && nextData.props.pageProps) || {}
  const ui = pp.userInfo
  if (!ui || typeof ui !== 'object') return null
  const info = ui.info
  if (!info || typeof info !== 'object') return null
  const nameCandidates = [info.name, info.screen_name, info.nick_name]
  for (const c of nameCandidates) {
    if (c != null && String(c).trim()) return String(c).trim()
  }
  return null
}

function parseFeedItemsFromUserHome(nextData) {
  const pp = (nextData.props && nextData.props.pageProps) || {}
  const feed =
    pp.defalutTabData && typeof pp.defalutTabData === 'object'
      ? pp.defalutTabData.data
      : pp.defaultTabData && typeof pp.defaultTabData === 'object'
        ? pp.defaultTabData.data
        : null
  return Array.isArray(feed) ? feed : []
}

function parseDisplayTimeSec(raw) {
  if (raw == null) return 0
  let n = 0
  if (typeof raw === 'number' && Number.isFinite(raw)) n = Math.floor(raw)
  else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    n = parseInt(raw.trim(), 10)
  }
  if (!n) return 0
  if (n > 1e12) return Math.floor(n / 1000)
  return n
}

function normalizeDateScope(scope) {
  const valid = new Set([
    'today',
    'yesterday',
    'last3Days',
    'last7Days',
    'last30Days',
    'last90Days',
    'last180Days',
    'last365Days',
  ])
  return valid.has(scope) ? scope : 'yesterday'
}

function getRangeSecByScope(scope) {
  const dateScope = normalizeDateScope(scope)
  const now = new Date()
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  )
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000)
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  if (dateScope === 'today') {
    return {
      startSec: Math.floor(todayStart.getTime() / 1000),
      endSec: Math.floor(tomorrowStart.getTime() / 1000),
    }
  }
  const daysMap = {
    last3Days: 3,
    last7Days: 7,
    last30Days: 30,
    last90Days: 90,
    last180Days: 180,
    last365Days: 365,
  }
  if (daysMap[dateScope]) {
    const days = daysMap[dateScope]
    const start = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    return {
      startSec: Math.floor(start.getTime() / 1000),
      endSec: Math.floor(tomorrowStart.getTime() / 1000),
    }
  }
  return {
    startSec: Math.floor(yesterdayStart.getTime() / 1000),
    endSec: Math.floor(todayStart.getTime() / 1000),
  }
}

/** 按时间范围判断（秒级时间戳） */
function isInDateScopeByLocalSec(sec, scope) {
  if (!sec) return false
  const { startSec, endSec } = getRangeSecByScope(scope)
  return sec >= startSec && sec < endSec
}

function parseArticleIdFromFeedItem(item) {
  if (!item || typeof item !== 'object') return null
  const candidates = [item.gid_str, item.gid, item.group_id_str, item.group_id]
  for (const c of candidates) {
    if (typeof c === 'string' && /^\d+$/.test(c.trim())) return c.trim()
    if (typeof c === 'number' && Number.isFinite(c)) return String(Math.floor(c))
  }
  const su =
    item.share_info && typeof item.share_info === 'object'
      ? item.share_info.share_url
      : null
  if (typeof su === 'string') {
    const m = su.match(/(?:group_id|article\/)(\d{8,})/i)
    if (m) return m[1]
  }
  return null
}

function textOrEmpty(v) {
  if (v == null) return ''
  return String(v).trim()
}

function decodeHtmlEntities(text) {
  if (!text) return ''
  return String(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function htmlToPlainText(html) {
  if (!html) return ''
  const s = String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeHtmlEntities(s)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function parseIsoDateToUnixSec(v) {
  if (typeof v !== 'string' || !v.trim()) return 0
  const ts = Date.parse(v)
  if (!Number.isFinite(ts)) return 0
  return Math.floor(ts / 1000)
}

function parseLdJsonArticle(html) {
  if (!html) return null
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1])
      if (data && typeof data === 'object' && data['@type'] === 'NewsArticle') {
        return data
      }
    } catch {
      // ignore invalid block
    }
  }
  return null
}

function parseArticleDetailForToday(nextData, articleId, articleUrl, fallback, rawHtml) {
  const pp = (nextData.props && nextData.props.pageProps) || {}
  const detail = pp.articleDetail
  const core =
    detail && typeof detail === 'object'
      ? detail.data && typeof detail.data === 'object'
        ? detail.data
        : detail
      : {}
  const ld = parseLdJsonArticle(rawHtml)
  const title = textOrEmpty(core.title || (ld && ld.headline) || fallback.title)
  const bodyText = textOrEmpty(
    htmlToPlainText(core.content) ||
      textOrEmpty(core.summary) ||
      textOrEmpty(core.abstract) ||
      textOrEmpty(fallback.content) ||
      title,
  )
  const createTime =
    parseDisplayTimeSec(
      core.display_time || core.publish_time || core.content_publish_time || core.create_time,
    ) ||
    parseIsoDateToUnixSec(ld && ld.datePublished) ||
    parseDisplayTimeSec(fallback.display_time)
  const contentType = textOrEmpty(core.content_type_desc || core.content_type || '文章')
  return {
    articleId,
    articleUrl,
    title,
    bodyText,
    createTime,
    contentType: contentType || '文章',
  }
}

async function h5MobileGet(session, url, referer) {
  const headers = {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,' +
      'image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    pragma: 'no-cache',
    referer,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'same-origin',
    'upgrade-insecure-requests': '1',
    'user-agent': MOBILE_UA,
  }
  return fetch(url, { headers, redirect: 'follow' })
}

function loadNextDataFromHtml(html) {
  const m = NEXT_DATA_RE.exec(html)
  if (!m) throw new Error('懂车帝页面未找到 __NEXT_DATA__（可能为风控页）')
  return JSON.parse(m[1])
}

/**
 * @param {string} articleUrlRaw
 * @param {{ includeFans?: boolean }} [options]
 *   includeFans 为 false 时不请求作者主页，仅用文章页解析到的粉丝数。
 * @returns {Promise<object>}
 */
async function fetchDongchediArticleStats(articleUrlRaw, options = {}) {
  const includeFans = options.includeFans !== false

  const original = String(articleUrlRaw || '').trim()
  if (!original) throw new Error('懂车帝链接为空')

  const h5Url = toH5ArticleUrl(original)
  const urlType = parseDongchediUrlType(h5Url)
  let r = await h5MobileGet(null, h5Url, 'https://m.dongchedi.com/')
  if (!r.ok) throw new Error(`懂车帝页面 HTTP ${r.status}`)
  let text = await r.text()
  let nd = loadNextDataFromHtml(text)

  let stats
  let fc = null
  let screenName = null
  let uid = null
  if (urlType === 'user') {
    screenName = parseUserHomeScreenName(nd)
    fc = parseUserHomeFansNum(nd)
    stats = {
      screenName,
      fansCount: fc,
      watchCount: null,
      haveEssence: null,
      authorUserId: h5Url.match(/\/user\/(\d+)/i)?.[1] || null,
      ...parseCarViewBundle(null),
    }
  } else {
    stats = parsePagePropsStats(nd)
    fc = stats.fansCount
    uid = stats.authorUserId
  }

  if (uid && includeFans) {
    try {
      await sleepRandomCarBetweenRequestsMs()
      const userUrl = `https://m.dongchedi.com/user/${uid}`
      const ru = await h5MobileGet(null, userUrl, 'https://m.dongchedi.com/')
      if (ru.ok) {
        const ut = await ru.text()
        const ndU = loadNextDataFromHtml(ut)
        const realFans = parseUserHomeFansNum(ndU)
        if (realFans != null) fc = realFans
      }
    } catch {
      // 保留文章页粉丝数
    }
  }

  let essenceLabel = null
  if (stats.haveEssence === true) essenceLabel = '是'
  else if (stats.haveEssence === false) essenceLabel = '否'

  return {
    articleUrl: h5Url,
    screenName: stats.screenName,
    fans: fc,
    watchCount: stats.watchCount,
    haveEssence: stats.haveEssence,
    haveEssenceLabel: essenceLabel,
    authorUserId: stats.authorUserId,
    koubeiCarModel: stats.koubeiCarModel,
    koubeiTotalScore: stats.koubeiTotalScore,
    koubeiDimensionScores: stats.koubeiDimensionScores,
  }
}

/**
 * 主页动态：先取用户主页 feed，按日期窗口筛文章 id，再逐条抓 /article/{id} 详情
 * @param {string} profileUrlRaw
 */
async function fetchDongchediUserTodayPostsRaw(profileUrlRaw, options = {}) {
  const original = String(profileUrlRaw || '').trim()
  if (!original) throw new Error('懂车帝链接为空')
  const { userId, userUrl } = normalizeDongchediUserUrl(original)

  const homeRes = await h5MobileGet(null, userUrl, 'https://m.dongchedi.com/')
  if (!homeRes.ok) throw new Error(`懂车帝主页 HTTP ${homeRes.status}`)
  const homeHtml = await homeRes.text()
  const homeNd = loadNextDataFromHtml(homeHtml)
  const feedItems = parseFeedItemsFromUserHome(homeNd)

  const idSeen = new Set()
  const todayCandidates = []
  for (const item of feedItems) {
    if (!item || typeof item !== 'object') continue
    const displayTime = parseDisplayTimeSec(item.display_time)
    if (!isInDateScopeByLocalSec(displayTime, options.dateScope)) continue
    const articleId = parseArticleIdFromFeedItem(item)
    if (!articleId || idSeen.has(articleId)) continue
    idSeen.add(articleId)
    todayCandidates.push({
      articleId,
      display_time: displayTime,
      title: textOrEmpty(item.title),
      content: textOrEmpty(item.content),
    })
  }

  const todayPosts = []
  for (const one of todayCandidates) {
    const fetchArticleUrl = `https://m.dongchedi.com/article/${one.articleId}`
    const articleUrlWeb = toDongchediWebArticleUrl(one.articleId)
    try {
      await sleepRandomCarBetweenRequestsMs()
      const ar = await h5MobileGet(null, fetchArticleUrl, userUrl)
      if (!ar.ok) throw new Error(`懂车帝文章 HTTP ${ar.status}`)
      const at = await ar.text()
      const ndA = loadNextDataFromHtml(at)
      todayPosts.push(
        parseArticleDetailForToday(ndA, one.articleId, articleUrlWeb, one, at),
      )
    } catch {
      // 详情失败时保留首页兜底字段，保证“今日更新数”与明细可用
      todayPosts.push({
        articleId: one.articleId,
        articleUrl: articleUrlWeb,
        title: one.title,
        bodyText: one.content || one.title || '',
        createTime: one.display_time || 0,
        contentType: '文章',
      })
    }
  }

  return {
    userId,
    profileUrl: userUrl,
    todayPosts,
  }
}

module.exports = {
  fetchDongchediArticleStats,
  fetchDongchediUserTodayPostsRaw,
  toH5ArticleUrl,
}

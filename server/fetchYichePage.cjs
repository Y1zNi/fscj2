'use strict'

const { sleepRandomCarBetweenRequestsMs } = require('./sleepBetweenRequests.cjs')

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

const FLOW_API_URL = 'https://mapi.yiche.com/web_api/flow_api/api/v1/flow/user_home_page'
const FLOW_CID = '601'

function normalizeYicheUserTopicsUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) throw new Error('易车链接为空')
  const u = new URL(s.startsWith('http') ? s : `https://${s}`)
  const host = u.hostname.toLowerCase()
  if (host !== 'i.yiche.com' && host !== 'i.m.yiche.com') {
    throw new Error('易车仅支持 i.yiche.com / i.m.yiche.com 个人主页链接')
  }
  const m = u.pathname.match(/^\/u(\d+)(?:\/|$)/i)
  if (!m) throw new Error('请使用易车个人主页链接（/u{userId}/!all/）')
  const userId = m[1]
  return {
    userId,
    profileUrl: `https://i.m.yiche.com/u${userId}/newcenter/!all/`,
  }
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

/** 生成目标窗口 [startMs, endMs) */
function getRangeMsByScope(scope) {
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
  ).getTime()
  const yesterdayStart = todayStart - 86400000
  const tomorrowStart = todayStart + 86400000
  if (dateScope === 'today') {
    return { startMs: todayStart, endMs: tomorrowStart }
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
    return {
      startMs: todayStart - (days - 1) * 86400000,
      endMs: tomorrowStart,
    }
  }
  return { startMs: yesterdayStart, endMs: todayStart }
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

/**
 * 从 flow 接口的 newsDetail（JSON 字符串）抽取正文：只保留 type=1 的文本块。
 * 去掉：图片块 type=2、文末声明 type=15、其它非正文块。
 */
function parseNewsDetailToPlainText(newsDetailRaw) {
  const raw = String(newsDetailRaw || '').trim()
  if (!raw) return ''
  let arr
  try {
    arr = JSON.parse(raw)
  } catch {
    return ''
  }
  if (!Array.isArray(arr)) return ''
  const parts = []
  for (const block of arr) {
    if (!block || typeof block !== 'object') continue
    const t = Number(block.type)
    if (t === 15) continue
    if (t === 2) continue
    if (t === 1 && typeof block.content === 'string') {
      const line = block.content.trim()
      if (line) parts.push(line)
    }
  }
  let text = parts.join('\n\n')
  text = decodeHtmlEntities(text)
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

function formatDate(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const d = new Date(ms)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getDatePrefix(text) {
  const m = String(text || '').match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

function parseDatePrefixToMs(text) {
  const prefix = getDatePrefix(text)
  if (!prefix) return 0
  const ts = new Date(prefix.replace(/-/g, '/')).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function buildYichePostUrl(item) {
  const mLinkUrl = String(item.mLinkUrl || '').trim()
  const newsUrl = String(item.newsUrl || '').trim()
  const url = String(item.url || '').trim()
  let raw = ''
  if (mLinkUrl) raw = mLinkUrl
  else if (newsUrl) {
    raw = newsUrl.startsWith('http') ? newsUrl : `https://hao.m.yiche.com${newsUrl}`
  } else if (url) raw = url
  if (!raw) return ''
  // 明细回填用 Web：hao.m / news.m / i.m 等 -> 去掉 .m. 段中的 m
  return raw.replace(/\.m\.yiche\.com/gi, '.yiche.com')
}

function detectYicheContentType(item) {
  const typeStr = String(item.type || '')
  const mixedText = [
    String(item.mLinkUrl || ''),
    String(item.newsUrl || ''),
    String(item.url || ''),
    typeStr,
  ]
    .join(' ')
    .toLowerCase()
  // 21 长文；20 常为 news.m.yiche.com 资讯短文（非 /wenzhang/ 路径）
  if (
    mixedText.includes('/wenzhang/') ||
    typeStr === '21' ||
    typeStr === '20'
  ) {
    return '文章'
  }
  if (
    mixedText.includes('news.m.yiche.com') &&
    typeStr !== '4'
  ) {
    return '文章'
  }
  if (mixedText.includes('/koubei/') || mixedText.includes('/dianping/')) return '点评'
  return ''
}

function isInDateRange(item, startMs, endMs) {
  const ts = Number(item.publishTimestamp || 0)
  if (Number.isFinite(ts) && ts > 0) {
    return ts >= startMs && ts < endMs
  }
  const dateMs = parseDatePrefixToMs(item.publishTime)
  if (!dateMs) return false
  return dateMs >= startMs && dateMs < endMs
}

function toTodayPostItem(item) {
  const contentType = detectYicheContentType(item)
  if (!contentType) return null
  const rawId = String(item.id || '').trim()
  if (!rawId) return null
  const postUrl = buildYichePostUrl(item)
  if (!postUrl) return null
  const title = decodeHtmlEntities(String(item.title || '').trim())
  const fromDetail = parseNewsDetailToPlainText(item.newsDetail)
  const summary = decodeHtmlEntities(
    String(item.summary || item.contentSummary || '').trim(),
  )
  const postAtText = String(item.publishTime || '').trim()
  const bodyText = fromDetail || summary || title
  return {
    postId: `${contentType}_${rawId}`,
    postUrl,
    title,
    bodyText,
    postAtText,
    contentType,
  }
}

async function requestFlowPage(userId, referer, timestamp) {
  const body = {
    cid: FLOW_CID,
    param: {
      userId: String(userId),
      timestamp: String(timestamp || Date.now()),
    },
  }
  const res = await fetch(FLOW_API_URL, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
      'cache-control': 'no-cache',
      cid: FLOW_CID,
      'content-type': 'application/json;charset=UTF-8',
      origin: 'https://i.m.yiche.com',
      pragma: 'no-cache',
      priority: 'u=1, i',
      referer,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': MOBILE_UA,
      'x-timestamp': String(Date.now()),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`易车flow接口 HTTP ${res.status}`)
  const json = await res.json()
  if (!json || String(json.status) !== '1' || !json.data) {
    throw new Error(`易车flow接口返回异常: ${String((json && json.message) || '')}`)
  }
  return json.data
}

async function fetchYicheTodayPostsByFlow(userId, profileUrl, dateScope) {
  const { startMs, endMs } = getRangeMsByScope(dateScope)
  const dedupeMap = new Map()
  let cursor = Date.now()
  let i = 0
  while (true) {
    if (i > 0) await sleepRandomCarBetweenRequestsMs()
    const pageData = await requestFlowPage(userId, profileUrl, cursor)
    const list = Array.isArray(pageData.list) ? pageData.list : []
    if (!list.length) break

    let hasToday = false
    let hasOldDate = false
    for (const one of list) {
      if (isInDateRange(one, startMs, endMs)) {
        hasToday = true
        const post = toTodayPostItem(one)
        if (post && !dedupeMap.has(post.postId)) dedupeMap.set(post.postId, post)
      } else {
        hasOldDate = true
      }
    }

    const nextCursor = Number(pageData.timestamp || pageData.lastRefreshTime || 0)
    if (!nextCursor || nextCursor === cursor) break
    cursor = nextCursor

    if (!hasToday && hasOldDate) break
    i += 1
  }
  return Array.from(dedupeMap.values())
}

/**
 * 易车主页今日更新（flow/user_home_page + timestamp 翻页）
 * @param {string} profileUrlRaw
 */
async function fetchYicheUserTodayPostsRaw(profileUrlRaw, options = {}) {
  const { userId, profileUrl } = normalizeYicheUserTopicsUrl(profileUrlRaw)
  const todayPosts = await fetchYicheTodayPostsByFlow(
    userId,
    profileUrl,
    options.dateScope,
  )
  return {
    userId,
    profileUrl,
    todayPosts,
  }
}

module.exports = { fetchYicheUserTodayPostsRaw }

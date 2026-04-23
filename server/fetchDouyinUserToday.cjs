'use strict'

const { get_ab } = require('./dy_ab.cjs')
const { sleepRandomBetweenRequestsMs } = require('./sleepBetweenRequests.cjs')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0'

function transCookies(cookieStr) {
  const cookies = {}
  if (!cookieStr || typeof cookieStr !== 'string') return cookies
  for (const part of cookieStr.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) cookies[k] = v
  }
  return cookies
}

function cookiesToHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function generateMsToken(len = 107) {
  const base =
    'ABCDEFGHIGKLMNOPQRSTUVWXYZabcdefghigklmnopqrstuvwxyz0123456789='
  let s = ''
  for (let i = 0; i < len; i++) {
    s += base[Math.floor(Math.random() * base.length)]
  }
  return s
}

function spliceUrl(params) {
  return Object.keys(params)
    .map((k) => {
      const v = params[k]
      return `${k}=${encodeURIComponent(v == null ? '' : String(v))}`
    })
    .join('&')
}

function parseSecUserId(userUrl) {
  const s = String(userUrl || '').trim()
  if (!s) {
    throw new Error('抖音主页链接为空')
  }
  const m = s.match(/douyin\.com\/user\/([^/?]+)/i)
  if (!m) {
    throw new Error('请填写抖音用户主页链接（需包含 /user/xxx）')
  }
  return m[1]
}

async function generateWebid(cookieHeader, refererUrl) {
  try {
    const r = await fetch(refererUrl, {
      headers: {
        'user-agent': UA,
        cookie: cookieHeader,
        'upgrade-insecure-requests': '1',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    })
    const text = await r.text()
    const m = text.match(/\\"user_unique_id\\":\\"([^"]+)\\"/)
    if (m) return m[1]
  } catch (_) {}
  let n = ''
  for (let i = 0; i < 19; i++) {
    n += String(Math.floor(Math.random() * 10))
  }
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

/** 支持 today / yesterday 的本地日历窗口（秒） */
function getRangeTsByScope(scope) {
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

function normalizeItem(item) {
  const awemeId = item?.aweme_id ? String(item.aweme_id) : ''
  if (!awemeId) return null
  const desc = String(item?.desc || '').trim()
  const createTime = Number(item?.create_time || 0)
  const isNote =
    Boolean(item?.image_post_info) ||
    Number(item?.aweme_type) === 68 ||
    Number(item?.aweme_type) === 51
  const workUrl = isNote
    ? `https://www.douyin.com/note/${awemeId}`
    : `https://www.douyin.com/video/${awemeId}`
  return {
    awemeId,
    workUrl,
    desc,
    createTime,
    workType: isNote ? 'note' : 'video',
  }
}

async function requestUserPosts({
  secUserId,
  userUrl,
  cookieHeader,
  msToken,
  verifyFp,
  webid,
  maxCursor,
}) {
  const params = {
    device_platform: 'webapp',
    aid: '6383',
    channel: 'channel_pc_web',
    sec_user_id: secUserId,
    max_cursor: String(maxCursor),
    locate_query: 'false',
    show_live_replay_strategy: '1',
    need_time_list: maxCursor === '0' ? '1' : '0',
    time_list_query: '0',
    whale_cut_token: '',
    cut_version: '1',
    count: '18',
    publish_video_strategy_type: '2',
    update_version_code: '170400',
    pc_client_type: '1',
    version_code: '290100',
    version_name: '29.1.0',
    cookie_enabled: 'true',
    screen_width: '1707',
    screen_height: '960',
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Edge',
    browser_version: '125.0.0.0',
    browser_online: 'true',
    engine_name: 'Blink',
    engine_version: '125.0.0.0',
    os_name: 'Windows',
    os_version: '10',
    cpu_core_num: '32',
    device_memory: '8',
    platform: 'PC',
    downlink: '10',
    effective_type: '4g',
    round_trip_time: '100',
    webid,
    msToken,
  }
  const queryForSign = spliceUrl(params)
  params.a_bogus = get_ab(queryForSign, '')
  params.verifyFp = verifyFp
  params.fp = verifyFp

  const query = spliceUrl(params)
  const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?${query}`
  const res = await fetch(apiUrl, {
    headers: {
      'user-agent': UA,
      accept: 'application/json, text/plain, */*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      referer: userUrl,
      cookie: cookieHeader,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
    },
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `抖音主页接口返回非 JSON（HTTP ${res.status}）：${text.slice(0, 240)}`,
    )
  }
  return json
}

async function fetchDouyinUserTodayPostsRaw(userUrl, cookieStr, options = {}) {
  const cookies = transCookies(cookieStr)
  if (!cookies.s_v_web_id) {
    throw new Error('Cookie 中缺少 s_v_web_id，请从已登录抖音网页复制完整 Cookie')
  }
  const secUserId = parseSecUserId(userUrl)
  const msToken = cookies.msToken || generateMsToken()
  cookies.msToken = msToken
  const verifyFp = cookies.s_v_web_id
  const cookieHeader = cookiesToHeader(cookies)
  const webid = await generateWebid(cookieHeader, userUrl)
  const { startSec, endSec } = getRangeTsByScope(options.dateScope)

  const todayPosts = []
  const seenMap = new Map()
  let maxCursor = '0'
  let hasMore = true
  while (hasMore) {
    await sleepRandomBetweenRequestsMs()
    const json = await requestUserPosts({
      secUserId,
      userUrl,
      cookieHeader,
      msToken,
      verifyFp,
      webid,
      maxCursor,
    })
    const list = Array.isArray(json?.aweme_list) ? json.aweme_list : []
    if (list.length === 0) break

    for (const rawItem of list) {
      const item = normalizeItem(rawItem)
      if (!item) continue
      const ct = item.createTime
      if (ct >= startSec && ct < endSec) {
        seenMap.set(item.awemeId, item)
      }
    }

    const oldest = Number(list[list.length - 1]?.create_time || 0)
    if (oldest > 0 && oldest < startSec) {
      break
    }

    hasMore = Number(json?.has_more || 0) === 1
    maxCursor = String(json?.max_cursor ?? '')
    if (!hasMore || !maxCursor) break
  }

  for (const item of seenMap.values()) {
    todayPosts.push(item)
  }
  todayPosts.sort((a, b) => b.createTime - a.createTime)

  return {
    secUserId,
    startSec,
    endSec,
    todayPosts,
  }
}

module.exports = {
  fetchDouyinUserTodayPostsRaw,
}

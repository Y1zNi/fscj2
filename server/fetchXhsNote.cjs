'use strict'

const crypto = require('crypto')
const { sleepRandomBetweenRequestsMs } = require('./sleepBetweenRequests.cjs')
const path = require('path')
const fs = require('fs')

/** 签名脚本统一放在 server/xhs/static（须含 xhs_xray_pack1/2，与 xhs_xray 同级） */
function resolveXhsStaticDir() {
  const dir = path.join(__dirname, 'xhs', 'static')
  const need = [
    'xhs_xs_xsc_56.js',
    'xhs_xray.js',
    'xhs_xray_pack1.js',
    'xhs_xray_pack2.js',
    'xhs_rap.js',
  ]
  for (const name of need) {
    if (!fs.existsSync(path.join(dir, name))) {
      throw new Error(
        `缺少小红书签名文件: server/xhs/static/${name}（请从上游 static 整包拷贝进该目录）`,
      )
    }
  }
  return dir
}

resolveXhsStaticDir()
// 须为字面路径，便于 pkg 打入可执行文件
const xs56 = require('./xhs/static/xhs_xs_xsc_56.js')
const { generateXRapParamAsync } = require('./xhs/rapParamClient.cjs')
let xrayModule = null
function requireSilently(modulePath) {
  const oldLog = console.log
  const oldInfo = console.info
  const oldWarn = console.warn
  try {
    console.log = () => {}
    console.info = () => {}
    console.warn = () => {}
    return require(modulePath)
  } finally {
    console.log = oldLog
    console.info = oldInfo
    console.warn = oldWarn
  }
}
try {
  xrayModule = requireSilently(require.resolve('./xhs/static/xhs_xray.js'))
} catch {
  xrayModule = null
}

const BASE = 'https://edith.xiaohongshu.com'

function transCookies(cookiesStr) {
  if (!cookiesStr || typeof cookiesStr !== 'string') return {}
  const sep = cookiesStr.includes('; ') ? '; ' : ';'
  const ck = {}
  for (const part of cookiesStr.split(sep)) {
    const idx = part.indexOf('=')
    if (idx <= 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1)
    if (k) ck[k] = v
  }
  return ck
}

function cookiesToHeader(cookies) {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function generateXB3Traceid(length = 16) {
  const hex = 'abcdef0123456789'
  let s = ''
  for (let i = 0; i < length; i++) {
    s += hex[Math.floor(16 * Math.random())]
  }
  return s
}

/** xhs_xray.js 依赖 pack 分包；无分包时用随机 hex（与常见 PC 请求长度相近） */
function generateXrayTraceid() {
  if (xrayModule && typeof xrayModule.traceId === 'function') {
    try {
      const v = xrayModule.traceId()
      if (v && typeof v === 'string') return v
    } catch {}
  }
  return crypto.randomBytes(24).toString('hex')
}

function getRequestHeadersTemplate(xrayTraceid) {
  return {
    authority: 'edith.xiaohongshu.com',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    'cache-control': 'no-cache',
    'content-type': 'application/json;charset=UTF-8',
    origin: 'https://www.xiaohongshu.com',
    pragma: 'no-cache',
    referer: 'https://www.xiaohongshu.com/',
    'sec-ch-ua':
      '"Not A(Brand";v="99", "Microsoft Edge";v="121", "Chromium";v="121"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    'x-b3-traceid': '',
    'x-mns': 'unload',
    'x-s': '',
    'x-s-common': '',
    'x-t': '',
    'x-xray-traceid': xrayTraceid,
  }
}

function generateHeaders(a1, api, data, method) {
  const ret = xs56.get_request_headers_params(api, data, a1, method)
  const xB3 = generateXB3Traceid()
  const headers = getRequestHeadersTemplate(generateXrayTraceid())
  headers['x-s'] = ret.xs
  headers['x-t'] = String(ret.xt)
  headers['x-s-common'] = ret.xs_common
  headers['x-b3-traceid'] = xB3
  let bodyStr = ''
  if (data !== '' && data != null) {
    if (typeof data === 'object') {
      bodyStr = JSON.stringify(data)
    } else if (String(data).trim()) {
      bodyStr = String(data)
    }
  }
  return { headers, bodyStr }
}

/**
 * 与 Spider_XHS cv-cat get_note_info 一致：POST /api/sns/web/v1/feed 需带 x-rap-param、xy-direction。
 * x-rap-param 须在 Worker 内生成，避免 xhs_rap.js 污染主线程 globalThis。
 */
async function applyNoteFeedWebHeaders(headers, api, bodyStr) {
  if (!bodyStr) return headers
  headers['x-rap-param'] = await generateXRapParamAsync(api, bodyStr)
  headers['xy-direction'] = '13'
  return headers
}

function generateRequestParams(cookiesStr, api, data, method) {
  const cookies = transCookies(cookiesStr)
  if (!cookies.a1) {
    throw new Error(
      '小红书 Cookie 中缺少 a1，请从已登录 xiaohongshu.com 的浏览器复制完整 Cookie',
    )
  }
  // 与上游实战经验对齐：这几个会话字段缺失时 feed 极易被风控拦截
  const mustKeys = ['web_session', 'websectiga', 'sec_poison_id']
  for (const key of mustKeys) {
    if (!cookies[key]) {
      throw new Error(`小红书 Cookie 中缺少 ${key}，请复制完整 Cookie`)
    }
  }
  const a1 = cookies.a1
  const { headers, bodyStr } = generateHeaders(a1, api, data, method)
  return { headers, cookies, bodyStr }
}

function spliceStr(api, params) {
  let url = api + '?'
  for (const key of Object.keys(params)) {
    let value = params[key]
    if (value == null) value = ''
    url += key + '=' + value + '&'
  }
  return url.slice(0, -1)
}

function parseNoteUrl(noteUrl) {
  let u
  try {
    u = new URL(noteUrl.trim())
  } catch {
    throw new Error('无效的小红书链接')
  }
  const parts = u.pathname.split('/').filter(Boolean)
  const noteId = parts.length ? parts[parts.length - 1] : ''
  if (!noteId) throw new Error('无法从链接解析笔记 id')
  const rawToken = u.searchParams.get('xsec_token')
  const xsecToken = rawToken ? decodeURIComponent(rawToken) : ''
  if (!xsecToken) {
    throw new Error('小红书链接需带 xsec_token（请从网页复制完整笔记链接）')
  }
  const xsecSource = u.searchParams.get('xsec_source') || 'pc_search'
  return { noteId, xsecToken, xsecSource }
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function timestampToStr(ms) {
  const d = new Date(ms)
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

function handleNoteInfo(data, noteUrlFallback) {
  const noteId = data.id
  const noteUrl = data.url || noteUrlFallback
  let noteType = data.note_card.type
  noteType = noteType === 'normal' ? '图集' : '视频'
  const userId = data.note_card.user.user_id
  const homeUrl = `https://www.xiaohongshu.com/user/profile/${userId}`
  const nickname = data.note_card.user.nickname
  const avatar = data.note_card.user.avatar
  let title = data.note_card.title
  if (!title || String(title).trim() === '') title = '无标题'
  const desc = data.note_card.desc
  const interact = data.note_card.interact_info
  const ipLocation =
    data.note_card.ip_location != null ? data.note_card.ip_location : '未知'
  const uploadTime = timestampToStr(data.note_card.time)
  return {
    note_id: noteId,
    note_url: noteUrl,
    note_type: noteType,
    user_id: userId,
    home_url: homeUrl,
    nickname,
    avatar,
    title,
    desc,
    liked_count: interact.liked_count,
    collected_count: interact.collected_count,
    comment_count: interact.comment_count,
    share_count: interact.share_count,
    upload_time: uploadTime,
    ip_location: ipLocation,
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchNoteFeed(noteUrl, cookieStr) {
  const { noteId, xsecToken, xsecSource } = parseNoteUrl(noteUrl)
  const api = '/api/sns/web/v1/feed'
  const data = {
    source_note_id: noteId,
    image_formats: ['jpg', 'webp', 'avif'],
    extra: { need_body_topic: '1' },
    xsec_source: xsecSource,
    xsec_token: xsecToken,
  }
  const baseParams = generateRequestParams(cookieStr, api, data, 'POST')
  const headers = await applyNoteFeedWebHeaders(
    { ...baseParams.headers },
    api,
    baseParams.bodyStr,
  )
  const { cookies, bodyStr } = baseParams
  const cookieHeader = cookiesToHeader(cookies)
  const requestFeed = async () => {
    const res = await fetch(BASE + api, {
      method: 'POST',
      headers: { ...headers, cookie: cookieHeader },
      body: bodyStr,
    })
    return res.json()
  }
  let resJson = await requestFeed()
  // 风控容错：code=-1 时用新 trace/sign 再试一次
  if (!resJson?.success && Number(resJson?.code) === -1) {
    await sleepMs(600 + Math.floor(Math.random() * 400))
    const retry = generateRequestParams(cookieStr, api, data, 'POST')
    const retryHeaders = await applyNoteFeedWebHeaders(
      { ...retry.headers },
      api,
      retry.bodyStr,
    )
    const retryRes = await fetch(BASE + api, {
      method: 'POST',
      headers: { ...retryHeaders, cookie: cookieHeader },
      body: retry.bodyStr,
    })
    resJson = await retryRes.json()
  }
  return resJson
}

function parseUserProfileUrl(profileUrl) {
  let u
  try {
    u = new URL(profileUrl.trim())
  } catch {
    throw new Error('无效的小红书主页链接')
  }
  const host = u.hostname.toLowerCase()
  if (!host.endsWith('xiaohongshu.com')) {
    throw new Error('请使用 xiaohongshu.com 用户主页链接')
  }
  const parts = u.pathname.split('/').filter(Boolean)
  const idx = parts.indexOf('profile')
  const userId =
    idx >= 0 && parts[idx + 1]
      ? parts[idx + 1]
      : parts.length >= 2 && parts[0] === 'user'
        ? parts[1]
        : ''
  if (!userId) {
    throw new Error('无法从链接解析用户 id（需为 …/user/profile/xxx）')
  }
  const rawToken = u.searchParams.get('xsec_token')
  const xsecToken = rawToken ? decodeURIComponent(rawToken) : ''
  const xsecSource = u.searchParams.get('xsec_source') || 'pc_search'
  return { userId, xsecToken, xsecSource }
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

/** 支持多时间范围的本地日历窗口（秒） */
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

function noteCardTimeToMs(t) {
  if (t == null) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 1e12 ? Math.floor(n * 1000) : Math.floor(n)
}

/** user_posted 单条：置顶为 interact_info.sticky === true */
function isPostedNoteSticky(raw) {
  if (!raw || typeof raw !== 'object') return false
  return Boolean(raw.interact_info && raw.interact_info.sticky)
}

function buildExploreNoteUrl(noteId, xsecToken) {
  const id = encodeURIComponent(String(noteId).trim())
  if (!xsecToken) {
    return `https://www.xiaohongshu.com/explore/${id}`
  }
  const tok = encodeURIComponent(String(xsecToken).trim())
  // 与 PC 侧常见 explore 链接一致：仅带 xsec_token；feed 体里 xsec_source 由 parseNoteUrl 默认 pc_search
  return `https://www.xiaohongshu.com/explore/${id}?xsec_token=${tok}`
}

async function fetchUserPostedPage(cookieStr, userId, cursor, xsecToken, xsecSource) {
  const api = '/api/sns/web/v1/user_posted'
  const params = {
    num: '30',
    cursor: cursor == null ? '' : String(cursor),
    user_id: userId,
    image_formats: 'jpg,webp,avif',
    xsec_token: xsecToken || '',
    xsec_source: xsecSource || 'pc_search',
  }
  const spliceApi = spliceStr(api, params)
  const { headers, cookies } = generateRequestParams(
    cookieStr,
    spliceApi,
    '',
    'GET',
  )
  const cookieHeader = cookiesToHeader(cookies)
  const res = await fetch(BASE + spliceApi, {
    method: 'GET',
    headers: { ...headers, cookie: cookieHeader },
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(
      `小红书 user_posted 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`,
    )
  }
  return json
}

async function fetchXhsUserTodayPostsRaw(profileUrl, cookieStr, options = {}) {
  const { userId, xsecToken, xsecSource } = parseUserProfileUrl(profileUrl)
  const { startSec, endSec } = getRangeSecByScope(options.dateScope)
  const seen = new Map()
  let cursor = ''
  let page = 0

  while (true) {
    if (page > 0) await sleepRandomBetweenRequestsMs()
    const resJson = await fetchUserPostedPage(
      cookieStr,
      userId,
      cursor,
      xsecToken,
      xsecSource,
    )
    if (!resJson || !resJson.success) {
      throw new Error(resJson?.msg || 'user_posted 请求失败')
    }
    const data = resJson.data || {}
    const notes = Array.isArray(data.notes) ? data.notes : []
    if (notes.length === 0) break

    let oldestSec = Number.POSITIVE_INFINITY
    /** 列表一般按发布时间从新到旧；早于筛选起点后无需再请求 feed 或翻页 */
    let stopCrawl = false

    for (const raw of notes) {
      const noteId = String(raw.note_id || raw.id || '').trim()
      if (!noteId) continue
      const token = raw.xsec_token
        ? decodeURIComponent(String(raw.xsec_token))
        : xsecToken
      const noteUrl = buildExploreNoteUrl(noteId, token)
      /** user_posted 列表不含发布时间，统一走 feed 取时间与正文摘要 */
      let publishMs = null
      const title = String(
        raw.display_title || raw.title || raw.desc || '',
      ).trim()
      let desc = title
      let noteTypeLabel = raw.type === 'video' ? '视频' : '图文'

      if (token) {
        await sleepRandomBetweenRequestsMs()
        try {
          const feedJson = await fetchNoteFeed(noteUrl, cookieStr)
          if (feedJson?.success && feedJson.data?.items?.[0]) {
            const item0 = feedJson.data.items[0]
            item0.url = noteUrl
            const info = handleNoteInfo(item0, noteUrl)
            publishMs =
              noteCardTimeToMs(item0.note_card?.time) ??
              new Date(info.upload_time.replace(/-/g, '/')).getTime()
            if (!Number.isFinite(publishMs)) publishMs = null
            desc = String(info.desc || info.title || title).trim() || title
            noteTypeLabel = info.note_type || noteTypeLabel
          }
        } catch {
          // 无时间则无法判断是否今日
        }
      }

      if (publishMs == null) continue
      const sec = Math.floor(publishMs / 1000)

      if (sec < startSec) {
        if (!isPostedNoteSticky(raw)) {
          stopCrawl = true
          break
        }
        continue
      }

      if (sec < oldestSec) oldestSec = sec

      if (sec >= startSec && sec < endSec) {
        if (!seen.has(noteId)) {
          seen.set(noteId, {
            noteId,
            noteUrl,
            desc: desc || title,
            createTime: sec,
            noteType: noteTypeLabel,
          })
        }
      }
    }

    if (stopCrawl) break

    if (Number.isFinite(oldestSec) && oldestSec < startSec) {
      break
    }

    const hasMore = Boolean(data.has_more)
    const nextCursor =
      data.cursor != null && data.cursor !== ''
        ? String(data.cursor)
        : ''
    if (!hasMore || !nextCursor) break
    cursor = nextCursor
    page++
  }

  const todayPosts = Array.from(seen.values())
  todayPosts.sort((a, b) => b.createTime - a.createTime)

  return {
    userId,
    profileUrl: profileUrl.trim(),
    todayPosts,
  }
}

module.exports = { fetchXhsUserTodayPostsRaw }

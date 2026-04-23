'use strict'

const { sleepRandomCarBetweenRequestsMs } = require('./sleepBetweenRequests.cjs')

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Mobile/15E148 Safari/604.1'

const PAGE_SIZE = 20

function normalizeInputUrl(raw) {
  let t = String(raw || '').trim()
  if (!t) throw new Error('链接为空')
  if (!/^https?:\/\//i.test(t)) {
    t = `https://${t}`
  }
  return t
}

/**
 * 合并 search 与 hash 中的 query（hash 如 #pvareaid=6845242 会转成与 ? 相同参与 Referer）
 * @param {URL} u
 */
function mergeTopicQueryFromUrl(u) {
  const params = new URLSearchParams()
  const searchRaw = u.search
    ? u.search.startsWith('?')
      ? u.search.slice(1)
      : u.search
    : ''
  if (searchRaw) {
    new URLSearchParams(searchRaw).forEach((v, k) => {
      params.set(k, v)
    })
  }
  const hashRaw =
    u.hash && u.hash.length > 1 ? u.hash.slice(1).replace(/^\?/, '') : ''
  if (hashRaw) {
    new URLSearchParams(hashRaw).forEach((v, k) => {
      if (!params.has(k)) params.set(k, v)
    })
  }
  const q = params.toString()
  return q ? `?${q}` : ''
}

/**
 * 解析 i / i.m 个人主页（/uid）或作者论坛主帖列表（/uid/club/topic）
 * @param {string} raw
 */
function parseAuthorClubTopicUrl(raw) {
  const u = new URL(normalizeInputUrl(raw))
  const host = u.hostname.toLowerCase()
  if (!host.endsWith('autohome.com.cn')) {
    throw new Error('不是汽车之家域名链接')
  }
  const query = mergeTopicQueryFromUrl(u)

  const topicM = u.pathname.match(/^\/(\d+)\/club\/topic(?:\/|$)/i)
  if (topicM) {
    return { uid: topicM[1], query }
  }

  const homeM = u.pathname.match(/^\/(\d+)\/?$/i)
  if (
    homeM &&
    (host === 'i.autohome.com.cn' || host === 'i.m.autohome.com.cn')
  ) {
    return { uid: homeM[1], query }
  }

  throw new Error(
    '请使用 i.autohome.com.cn 或 i.m 上的个人主页（/用户id）或论坛主帖列表（/用户id/club/topic）',
  )
}

function buildMobileTopicReferer(uid, query) {
  return `https://i.m.autohome.com.cn/${uid}/club/topic${query || ''}`
}

function normalizePostDateText(postdate) {
  return String(postdate || '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parsePostDateToMs(postdate) {
  const s = normalizePostDateText(postdate)
  if (!s) return null
  const d = new Date(s.replace(/-/g, '/'))
  const t = d.getTime()
  return Number.isNaN(t) ? null : t
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

/** 支持多时间范围的本地日历窗口（毫秒） */
function getStartEndMsByScope(scope) {
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

/**
 * M 站帖子详情（与列表里的 bbs、bbsid、topicid 对应，可带主页同步的 query 如 pvareaid）
 * @param {{ bbs?: string, bbsid?: number|string, topicid: number|string }} row
 * @param {string} profileSearch 如 ?pvareaid=101968
 */
function buildClubMThreadUrl(row, profileSearch) {
  const bbs = String(row.bbs || 'a').trim() || 'a'
  const bbsid = String(row.bbsid != null ? row.bbsid : '').trim()
  const topicid = String(row.topicid || '').trim()
  if (!bbsid || !topicid) {
    return null
  }
  const base = `https://club.m.autohome.com.cn/bbs/thread-${bbs}-${bbsid}-${topicid}-1.html`
  const q = String(profileSearch || '').trim()
  if (!q) return base
  return q.startsWith('?') ? `${base}${q}` : `${base}?${q}`
}

/**
 * 从 mainTopic.t_content 等 HTML 抽纯文本（作论坛正文文案）
 * @param {string} html
 */
function stripHtmlToPlainText(html) {
  let s = String(html || '')
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s.replace(/&nbsp;/gi, ' ')
  s = s.replace(/&lt;/gi, '<')
  s = s.replace(/&gt;/gi, '>')
  s = s.replace(/&amp;/gi, '&')
  s = s.replace(/&#(\d+);/g, (full, n) => {
    const code = Number(n)
    return Number.isFinite(code) && code >= 0
      ? String.fromCharCode(code)
      : full
  })
  s = s.replace(/&#x([0-9a-f]+);/gi, (full, h) => {
    const code = parseInt(h, 16)
    return Number.isFinite(code) && code >= 0
      ? String.fromCharCode(code)
      : full
  })
  return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim()
}

/** 明细回填用 PC Web 帖子链（抓取仍可用 M 站） */
function toAutohomeWebThreadUrl(u) {
  const s = String(u || '').trim()
  if (!s) return s
  return s.replace(/club\.m\.autohome\.com\.cn/gi, 'club.autohome.com.cn')
}

/** 写回/展示的帖子链接：固定为请求的 thread-{bbs}-{bbsid}-{topicid}，不跟 hex 规范地址 */
function normalizeRequestThreadUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return `https:${s}`
  if (s.startsWith('/')) return `https://club.m.autohome.com.cn${s}`
  return `https://${s.replace(/^\/+/, '')}`
}

function decodeJsQuotedString(str) {
  return String(str || '')
    .replace(/\\u([0-9a-fA-F]{4})/gi, (_, h) =>
      String.fromCharCode(parseInt(h, 16)),
    )
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
}

/**
 * 旧版 club.m 详情（C# / Zepto）：内联 `tz`、`Config.share`、`.tz-paragraph`
 * @param {string} html
 */
function parseLegacyClubMDetail(html) {
  let title = ''
  const topicTitleM = html.match(
    /"topic"\s*:\s*\{[\s\S]*?"Title"\s*:\s*"((?:[^"\\]|\\.)*)"/,
  )
  if (topicTitleM) {
    title = decodeJsQuotedString(topicTitleM[1]).trim()
  }
  if (!title) {
    const h1m = html.match(
      /<div class="bbs-post-title">\s*<h1>\s*([\s\S]*?)\s*<\/h1>/i,
    )
    if (h1m) title = stripHtmlToPlainText(h1m[1])
  }

  const paras = []
  const re = /<div class="tz-paragraph">([\s\S]*?)<\/div>/gi
  let m
  while ((m = re.exec(html))) {
    const line = stripHtmlToPlainText(m[1])
    if (line) paras.push(line)
  }
  let bodyText = paras.join('\n').trim()

  if (!bodyText) {
    const descM = html.match(
      /Config\.share\.description\s*=\s*"((?:[^"\\]|\\.)*)"/,
    )
    if (descM) bodyText = decodeJsQuotedString(descM[1]).trim()
  }
  if (!bodyText) bodyText = title

  return { title: title.trim(), bodyText }
}

/**
 * GET club.m 帖子详情（旧版 thread-{bbs}-{bbsid}-{topicid}）：只解析内联 tz / .tz-paragraph / Config.share
 * 帖子链接固定为请求 URL，不采用 hex 跳转后的地址
 * @param {string} threadUrl
 */
async function fetchClubMThreadMainTopic(threadUrl) {
  const stableThreadUrl = normalizeRequestThreadUrl(threadUrl)

  await sleepRandomCarBetweenRequestsMs()
  const res = await fetch(threadUrl, {
    method: 'GET',
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: threadUrl,
      'User-Agent': MOBILE_UA,
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    },
    redirect: 'follow',
  })
  const html = await res.text()

  if (!res.ok) {
    return { threadUrl: stableThreadUrl, title: '', bodyText: '' }
  }

  const legacy = parseLegacyClubMDetail(html)
  return {
    threadUrl: stableThreadUrl,
    title: legacy.title || legacy.bodyText || '',
    bodyText: legacy.bodyText || legacy.title || '',
  }
}

/**
 * @param {string} uid
 * @param {number} pageIndex 1-based
 * @param {string} referer
 */
async function fetchAjaxTopicPage(uid, pageIndex, referer) {
  const qs = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(PAGE_SIZE),
    uid,
  })
  const url = `https://i.m.autohome.com.cn/topic/AjaxTopic?${qs.toString()}`
  const body = new URLSearchParams({ v: String(Date.now()) }).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://i.m.autohome.com.cn',
      Referer: referer,
      'User-Agent': MOBILE_UA,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    },
    body,
    redirect: 'follow',
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`AjaxTopic 返回非 JSON（HTTP ${res.status}）`)
  }
  if (!res.ok) {
    throw new Error(`AjaxTopic 请求失败 HTTP ${res.status}`)
  }
  if (Number(json.returncode) !== 0) {
    const msg = json.message != null ? String(json.message) : '接口错误'
    throw new Error(`AjaxTopic: ${msg}`)
  }
  return json
}

/**
 * @param {string} profileUrlRaw
 */
async function fetchAutohomeUserTodayPostsRaw(profileUrlRaw, options = {}) {
  const profileUrl = String(profileUrlRaw || '').trim()
  const { uid, query } = parseAuthorClubTopicUrl(profileUrl)
  const referer = buildMobileTopicReferer(uid, query)
  const { startMs, endMs } = getStartEndMsByScope(options.dateScope)

  const todayPosts = []
  const seenTopic = new Set()
  let pageIndex = 1

  while (true) {
    if (pageIndex > 1) await sleepRandomCarBetweenRequestsMs()
    const json = await fetchAjaxTopicPage(uid, pageIndex, referer)
    const result = json.result || {}
    const list = Array.isArray(result.list) ? result.list : []
    const pagecount = Math.max(1, Number(result.pagecount) || 1)

    if (list.length === 0) {
      break
    }

    let minMsInPage = Infinity
    let hasParsedDate = false

    for (const row of list) {
      const ms = parsePostDateToMs(row.postdate)
      if (ms != null) {
        hasParsedDate = true
        if (ms < minMsInPage) {
          minMsInPage = ms
        }
      }
      if (ms == null || ms < startMs || ms >= endMs) {
        continue
      }
      const topicId = String(row.topicid || '').trim()
      if (!topicId || seenTopic.has(topicId)) {
        continue
      }
      seenTopic.add(topicId)
      const listTitle = String(row.title || '').trim()
      const topicType = String(row.topictype || '').trim()
      const bbsName = String(row.bbsname || '').trim()

      const threadUrlGuess = buildClubMThreadUrl(row, query)
      let threadUrl = threadUrlGuess || ''
      let title = listTitle
      let bodyText = listTitle

      if (threadUrlGuess) {
        try {
          const detail = await fetchClubMThreadMainTopic(threadUrlGuess)
          threadUrl = detail.threadUrl || threadUrlGuess
          if (detail.title) {
            title = detail.title
          }
          if (detail.bodyText) {
            bodyText = detail.bodyText
          }
        } catch {
          // 详情失败时仍保留列表标题与拼出的 M 站链接
          bodyText = listTitle
        }
      }

      todayPosts.push({
        topicId,
        title,
        bodyText,
        threadUrl: toAutohomeWebThreadUrl(threadUrl),
        postAtText: normalizePostDateText(row.postdate),
        topicType,
        bbsName,
      })
    }

    if (pageIndex >= pagecount) {
      break
    }

    // 列表按发帖时间倒序：本页最旧一条已在目标窗口起点之前，则无需再翻页
    if (hasParsedDate && minMsInPage !== Infinity && minMsInPage < startMs) {
      break
    }

    pageIndex += 1
  }

  return {
    uid,
    profileUrl,
    todayPosts,
  }
}

module.exports = {
  fetchAutohomeUserTodayPostsRaw,
  parseAuthorClubTopicUrl,
}

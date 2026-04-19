'use strict'

/**
 * 挂载 /api/* 抓取路由（供 Vite dev 与 Express 桌面服共用）
 * @param {(path: string, handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void) => void} mount
 */
function mountSocialApiRoutes(mount) {
  mount('/api/douyin-user-today', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const { fetchDouyinUserTodayPostsRaw } = require('./fetchDouyinUserToday.cjs')
          const parsed = JSON.parse(body || '{}')
          const { userUrl, cookie } = parsed
          if (!userUrl || !cookie) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: false,
                message: '缺少 userUrl 或 cookie',
              }),
            )
            return
          }
          const data = await fetchDouyinUserTodayPostsRaw(userUrl, cookie)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, data }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })()
    })
  })

  mount('/api/xhs-user-today', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const { fetchXhsUserTodayPostsRaw } = require('./fetchXhsNote.cjs')
          const parsed = JSON.parse(body || '{}')
          const { profileUrl, cookie } = parsed
          if (!profileUrl || !cookie) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: false,
                message: '缺少 profileUrl 或 cookie',
              }),
            )
            return
          }
          const data = await fetchXhsUserTodayPostsRaw(profileUrl, cookie)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, data }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })()
    })
  })

  mount('/api/autohome-user-today', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const { fetchAutohomeUserTodayPostsRaw } = require('./fetchAutohomeUserToday.cjs')
          const parsed = JSON.parse(body || '{}')
          const { profileUrl } = parsed
          if (!profileUrl) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(
              JSON.stringify({
                ok: false,
                message: '缺少 profileUrl',
              }),
            )
            return
          }
          const data = await fetchAutohomeUserTodayPostsRaw(profileUrl)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, data }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })()
    })
  })

  mount('/api/dongchedi-article', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const { fetchDongchediArticleStats } = require('./fetchDongchediArticle.cjs')
          const parsed = JSON.parse(body || '{}')
          const url = parsed.url
          if (!url || typeof url !== 'string') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, message: '缺少 url' }))
            return
          }
          const data = await fetchDongchediArticleStats(url, {
            includeFans: parsed.includeFans,
          })
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, data }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })()
    })
  })

  mount('/api/dongchedi-user-today', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const { fetchDongchediUserTodayPostsRaw } = require('./fetchDongchediArticle.cjs')
          const parsed = JSON.parse(body || '{}')
          const { profileUrl } = parsed
          if (!profileUrl || typeof profileUrl !== 'string') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, message: '缺少 profileUrl' }))
            return
          }
          const data = await fetchDongchediUserTodayPostsRaw(profileUrl)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, data }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })()
    })
  })

  mount('/api/yiche-user-today', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      void (async () => {
        try {
          const { fetchYicheUserTodayPostsRaw } = require('./fetchYichePage.cjs')
          const parsed = JSON.parse(body || '{}')
          const profileUrl = parsed.profileUrl
          if (!profileUrl || typeof profileUrl !== 'string') {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ ok: false, message: '缺少 profileUrl' }))
            return
          }
          const data = await fetchYicheUserTodayPostsRaw(profileUrl)
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, data }))
        } catch (e) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              ok: false,
              message: e instanceof Error ? e.message : String(e),
            }),
          )
        }
      })()
    })
  })
}

module.exports = { mountSocialApiRoutes }

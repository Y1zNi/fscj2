'use strict'

const path = require('path')
const fs = require('fs')
const http = require('http')
const { exec } = require('child_process')
const express = require('express')
const { mountSocialApiRoutes } = require('./socialApiRoutes.cjs')

const PREFERRED_PORT = Number(process.env.PORT) || 3789

/** exe 旁 dist 优先，其次打包快照内 dist */
function getDistDir() {
  if (process.pkg) {
    const beside = path.join(path.dirname(process.execPath), 'dist')
    if (fs.existsSync(path.join(beside, 'index.html'))) {
      return beside
    }
    return path.join(__dirname, '..', 'dist')
  }
  return path.join(__dirname, '..', 'dist')
}

function buildControlHtml(port) {
  const base = `http://127.0.0.1:${port}`
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>抓取服务控制台</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 40px auto; padding: 0 16px; }
    h1 { font-size: 18px; margin-bottom: 8px; }
    .port { font-size: 22px; font-weight: 600; color: #1677ff; margin: 12px 0; }
    .hint { color: #666; font-size: 13px; line-height: 1.5; margin-bottom: 20px; }
    a { color: #1677ff; }
    button {
      display: inline-block; padding: 10px 20px; font-size: 14px;
      border: none; border-radius: 6px; cursor: pointer; margin-right: 10px; margin-bottom: 10px;
    }
    .primary { background: #1677ff; color: #fff; }
    .danger { background: #ff4d4f; color: #fff; }
    .msg { margin-top: 16px; font-size: 13px; color: #333; min-height: 1.2em; }
  </style>
</head>
<body>
  <h1>飞书插件 · 本地抓取服务</h1>
  <div class="port">端口：<span id="p">${port}</span></div>
  <p class="hint">
    在飞书多维表格插件里把页面地址配置为：<br />
    <strong><a href="${base}/" target="_blank" rel="noreferrer">${base}/</a></strong>
  </p>
  <div>
    <a href="${base}/" target="_blank" rel="noreferrer"><button type="button" class="primary">打开插件页面</button></a>
    <button type="button" class="danger" id="stop">停止服务</button>
  </div>
  <p class="msg" id="msg"></p>
  <script>
    document.getElementById('stop').onclick = async function () {
      var el = document.getElementById('msg');
      el.textContent = '正在停止…';
      try {
        var r = await fetch('/__shutdown', { method: 'POST' });
        el.textContent = r.ok ? '已停止，可关闭本窗口。' : '停止失败：' + r.status;
      } catch (e) {
        el.textContent = '已请求停止（若窗口未关闭可手动结束进程）。';
      }
    };
  </script>
</body>
</html>`
}

function openControlBrowser(port) {
  const url = `http://127.0.0.1:${port}/__control`
  if (process.env.NO_OPEN) return
  if (process.platform === 'win32') {
    exec(`cmd /c start "" "${url}"`)
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`)
  } else {
    exec(`xdg-open "${url}"`)
  }
}

function createApp(port, distDir, serverRef) {
  const app = express()
  app.disable('x-powered-by')

  mountSocialApiRoutes((route, handler) => app.use(route, handler))

  app.get('/__control', (req, res) => {
    res.type('html').send(buildControlHtml(port))
  })

  app.post('/__shutdown', (req, res) => {
    res.type('text').send('ok')
    setTimeout(() => {
      const s = serverRef.server
      if (s) {
        s.close(() => process.exit(0))
      } else {
        process.exit(0)
      }
    }, 80)
  })

  app.use(express.static(distDir, { index: ['index.html'] }))

  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/__')
    ) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })

  app.use((req, res) => {
    if (req.path.startsWith('/api')) {
      res.status(404).type('json')
      res.end(JSON.stringify({ ok: false, message: 'Not found' }))
      return
    }
    res.status(404).end('Not found')
  })

  return app
}

function listenHttp(app, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    const onErr = (err) => {
      server.off('error', onErr)
      reject(err)
    }
    server.on('error', onErr)
    server.listen(port, '0.0.0.0', () => {
      server.off('error', onErr)
      resolve(server)
    })
  })
}

async function start() {
  const distDir = getDistDir()
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(
      `未找到前端构建目录 dist（需要 index.html）。请先在本机执行 npm run build，${
        process.pkg ? '或将 dist 文件夹放在本程序同目录。' : ''
      }`,
    )
  }

  let port = PREFERRED_PORT
  const maxPort = PREFERRED_PORT + 20
  let lastErr = null
  let server = null
  const serverRef = { server: null }

  while (port < maxPort) {
    try {
      const app = createApp(port, distDir, serverRef)
      server = await listenHttp(app, port)
      serverRef.server = server
      break
    } catch (e) {
      lastErr = e
      if (e && e.code === 'EADDRINUSE') {
        port++
        continue
      }
      throw e
    }
  }

  if (!server) {
    throw lastErr || new Error('无法绑定端口')
  }

  console.log('')
  console.log('========================================')
  console.log('  抓取服务已启动')
  console.log('  插件地址: http://127.0.0.1:' + port + '/')
  console.log('  控制台:   http://127.0.0.1:' + port + '/__control')
  console.log('========================================')
  console.log('')

  openControlBrowser(port)
  return { port, server }
}

module.exports = { start, getDistDir }

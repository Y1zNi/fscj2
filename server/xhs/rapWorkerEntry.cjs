'use strict'

/**
 * 独立线程加载 xhs_rap.js，避免向主线程 globalThis 注入 window/XMLHttpRequest 等，
 * 防止污染 fetch / 其它依赖全局的实现（打包长驻服务下曾出现异常）。
 */
const { parentPort } = require('worker_threads')
const { generate_x_rap_param } = require('./static/xhs_rap.js')

parentPort.on('message', (msg) => {
  const { taskId, api, bodyStr } = msg
  try {
    const rap = generate_x_rap_param(api, bodyStr)
    parentPort.postMessage({ taskId, ok: true, rap })
  } catch (err) {
    parentPort.postMessage({
      taskId,
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    })
  }
})

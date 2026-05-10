'use strict'

const path = require('path')
const { Worker } = require('worker_threads')

let worker = null
let taskSeq = 0
const pending = new Map()

function killWorker() {
  if (worker) {
    try {
      worker.terminate()
    } catch (_) {}
    worker = null
  }
}

function ensureWorker() {
  if (worker) return worker
  const entry = path.join(__dirname, 'rapWorkerEntry.cjs')
  worker = new Worker(entry)
  worker.on('message', (msg) => {
    const p = pending.get(msg.taskId)
    if (!p) return
    pending.delete(msg.taskId)
    if (msg.ok) {
      p.resolve(msg.rap)
    } else {
      p.reject(new Error(msg.message || 'x-rap-param 生成失败'))
    }
  })
  worker.on('error', (err) => {
    for (const [, pr] of pending) {
      pr.reject(err)
    }
    pending.clear()
    killWorker()
  })
  worker.on('exit', (code) => {
    if (code !== 0 && pending.size > 0) {
      const err = new Error(`rap worker 异常退出（code=${code}）`)
      for (const [, pr] of pending) {
        pr.reject(err)
      }
      pending.clear()
    }
    worker = null
  })
  return worker
}

/**
 * @param {string} api 如 /api/sns/web/v1/feed
 * @param {string} bodyStr 与签名一致的 JSON 字符串
 * @returns {Promise<string>}
 */
function generateXRapParamAsync(api, bodyStr) {
  return new Promise((resolve, reject) => {
    const taskId = ++taskSeq
    pending.set(taskId, { resolve, reject })
    try {
      ensureWorker().postMessage({ taskId, api, bodyStr })
    } catch (e) {
      pending.delete(taskId)
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

module.exports = { generateXRapParamAsync }

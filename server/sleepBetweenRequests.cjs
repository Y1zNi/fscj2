'use strict'

/**
 * 单条主页任务内：除「本条任务第一次向外发起的请求」外，在每一次新请求之前调用本函数，
 * 形成「仅相邻两次请求之间」的随机间隔（不在整条任务最开头多等一次）。
 *
 * 抖音主页列表、小红书笔记等：随机 2～5 秒
 * @returns {Promise<void>}
 */
function sleepRandomBetweenRequestsMs() {
  const ms = 2000 + Math.floor(Math.random() * 3001)
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 汽车之家 / 懂车帝 / 易车：同上，随机 1～3 秒
 * @returns {Promise<void>}
 */
function sleepRandomCarBetweenRequestsMs() {
  const ms = 1000 + Math.floor(Math.random() * 2000)
  return new Promise((r) => setTimeout(r, ms))
}

module.exports = {
  sleepRandomBetweenRequestsMs,
  sleepRandomCarBetweenRequestsMs,
}

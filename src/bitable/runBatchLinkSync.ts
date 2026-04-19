import { bitable, FieldType } from '@lark-base-open/js-sdk'
import type {
  IDateTimeField,
  INumberField,
  ITextField,
} from '@lark-base-open/js-sdk'

import { fetchAutohomeUserTodayPosts } from '../autohome/fetchUserToday'
import { isObviousAutohomeAuthorUrl } from '../autohome/isAutohomeAuthorUrl'
import { fetchDongchediUserTodayPosts } from '../dongchedi/fetchUserToday'
import { isObviousDongchediArticleUrl } from '../dongchedi/isDongchediArticleUrl'
import { fetchDouyinUserTodayPosts } from '../douyin/fetchUserToday'
import { isObviousDouyinUserUrl } from '../douyin/isDouyinUserUrl'
import { fetchXhsUserTodayPosts } from '../xhs/fetchUserToday'
import { isObviousXhsUserUrl } from '../xhs/isXhsUserUrl'
import { fetchYicheUserTodayPosts } from '../yiche/fetchUserToday'
import { isObviousYichePageUrl } from '../yiche/isYichePageUrl'

/** 抖音、小红书：同平台相邻两次抓取最小间隔 */
const MIN_GAP_DYXHS_MS = 3000
/** 汽车之家、懂车帝、易车：同平台相邻两次抓取最小间隔 */
const MIN_GAP_CAR_MS = 1500
const DY_DETAIL_TABLE_NAME_DEFAULT = '抖音今日明细'
const XHS_DETAIL_TABLE_NAME_DEFAULT = '小红书今日明细'
const AH_DETAIL_TABLE_NAME_DEFAULT = '汽车之家今日明细'
const DC_DETAIL_TABLE_NAME_DEFAULT = '懂车帝今日明细'
const YI_DETAIL_TABLE_NAME_DEFAULT = '易车今日明细'

/**
 * 明细子表是否创建并写入「用户 id + 作品/内容 id」列。
 * 临时改为 false；需恢复时改为 true 并取消下方各段注释块中的对应注释。
 */
const WRITE_DETAIL_USER_AND_WORK_IDS = false

/**
 * 明细子表是否创建并写入「内容类型」列；临时 false，恢复时改为 true。
 */
const WRITE_DETAIL_CONTENT_TYPE = false

type ActiveTable = Awaited<ReturnType<(typeof bitable.base)['getActiveTable']>>
/** 避免 addTable fields 在条件展开时被推断成宽泛的 FieldType，导致 TS 报错 */
type DetailTextCol = { name: string; type: FieldType.Text }

/**
 * 按当前表格视图自上而下顺序取 recordId（与界面可见行一致）。
 * 优先用当前选区中的 viewId + 可见行列表；失败则按视图分页拉取；再退回 getRecordIdList。
 */
async function getRecordIdsTopToBottom(table: ActiveTable): Promise<string[]> {
  const selection = await bitable.base.getSelection()
  const viewId = selection.viewId

  if (viewId) {
    try {
      const view = await table.getViewById(viewId)
      const visible = await view.getVisibleRecordIdList()
      const ids = visible.filter((id): id is string => Boolean(id))
      if (ids.length > 0) {
        return ids
      }
    } catch {
      // 继续尝试 getRecords
    }

    try {
      const ordered: string[] = []
      let pageToken: string | undefined
      for (;;) {
        const res = await table.getRecords({
          viewId,
          pageSize: 500,
          pageToken,
        })
        for (const rec of res.records) {
          ordered.push(rec.recordId)
        }
        if (!res.hasMore || !res.pageToken) {
          break
        }
        pageToken = res.pageToken
      }
      if (ordered.length > 0) {
        return ordered
      }
    } catch {
      // 退回旧逻辑
    }
  }

  const fallback = (await table.getRecordIdList()).filter(Boolean) as string[]
  return fallback
}

export interface BatchLinkSyncConfig {
  linkFieldId: string
  douyinCookie: string
  xhsCookie: string
  /** 主表：本次同步日期（文本列写 yyyy-mm-dd；日期列写当天 0 点本地时间戳） */
  dySyncDateFieldId?: string
  dyTodayCountId?: string
  dyDetailTableName?: string
  /** 主表：本次同步日期（文本 yyyy-mm-dd 或日期列当天 0 点） */
  xhsSyncDateFieldId?: string
  xhsTodayCountId?: string
  xhsDetailTableName?: string
  /** 主表：本次同步日期（文本 yyyy-mm-dd 或日期列当天 0 点） */
  ahSyncDateFieldId?: string
  ahTodayCountId?: string
  ahDetailTableName?: string
  /** 主表：本次同步日期（文本 yyyy-mm-dd 或日期列当天 0 点） */
  dcSyncDateFieldId?: string
  dcTodayCountId?: string
  dcDetailTableName?: string
  /** 主表：本次同步日期（文本 yyyy-mm-dd 或日期列当天 0 点） */
  yiSyncDateFieldId?: string
  yiTodayCountId?: string
  yiDetailTableName?: string
  onProgress?: (done: number, total: number, recordId: string) => void
  delayMs?: number
}

/** 距上次同平台请求结束不足 minGapMs 则补眠，各平台分别计时 */
async function sleepUntilPlatformGap(
  lastEndAtMs: number,
  minGapMs: number,
): Promise<void> {
  if (lastEndAtMs <= 0) return
  const need = minGapMs - (Date.now() - lastEndAtMs)
  if (need > 0) {
    await new Promise((r) => setTimeout(r, need))
  }
}

function formatDateTime(sec: number): string {
  if (!sec) return ''
  const d = new Date(sec * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

/** 明细「抓取日期」：当天本地 yyyy-mm-dd */
function getTodayDateText(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * 作品/笔记/帖子/文章链接去重键：去 query/hash、统一主机名（与写回 Web 链一致时更易对齐旧 M 链）
 */
function normalizeWorkUrlForDedupe(raw: string): string {
  const s = String(raw || '').trim()
  if (!s) return ''
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`)
    u.hash = ''
    u.search = ''
    let host = u.hostname.toLowerCase()
    if (host === 'm.dongchedi.com') host = 'www.dongchedi.com'
    if (host === 'club.m.autohome.com.cn') host = 'club.autohome.com.cn'
    if (host.endsWith('.m.yiche.com')) {
      host = host.replace(/\.m\.yiche\.com/i, '.yiche.com')
    }
    const path = u.pathname.replace(/\/+$/, '') || '/'
    return `${host}${path}`
  } catch {
    return s.toLowerCase().replace(/\/+$/, '')
  }
}

async function buildWorkUrlToRecordIdMap(
  detailTable: Awaited<ReturnType<(typeof bitable.base)['getTableById']>>,
  urlFieldId: string,
): Promise<Map<string, string>> {
  if (!urlFieldId.trim()) return new Map()
  const map = new Map<string, string>()
  const recordIds = await detailTable.getRecordIdList()
  for (const rid of recordIds) {
    const raw = (await detailTable.getCellString(urlFieldId, rid)).trim()
    const key = normalizeWorkUrlForDedupe(raw)
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, rid)
    }
  }
  return map
}

async function ensureDouyinDetailTable(tableName: string) {
  const name = tableName.trim() || DY_DETAIL_TABLE_NAME_DEFAULT
  const tableMetaList = await bitable.base.getTableMetaList()
  let tableMeta = tableMetaList.find((t) => t.name === name)
  if (!tableMeta) {
    const created = await bitable.base.addTable({
      name,
      fields: [
        { name: '主页链接', type: FieldType.Text },
        ...(WRITE_DETAIL_USER_AND_WORK_IDS
          ? ([
              { name: 'sec_uid', type: FieldType.Text },
              { name: 'aweme_id', type: FieldType.Text },
            ] as DetailTextCol[])
          : []),
        { name: '作品链接', type: FieldType.Text },
        { name: '文案', type: FieldType.Text },
        { name: '发布时间', type: FieldType.Text },
        ...(WRITE_DETAIL_CONTENT_TYPE
          ? ([{ name: '内容类型', type: FieldType.Text }] as DetailTextCol[])
          : []),
        { name: '抓取日期', type: FieldType.Text },
      ],
    })
    tableMeta = { id: created.tableId, name }
  }
  const detailTable = await bitable.base.getTableById(tableMeta.id)
  const metas = await detailTable.getFieldMetaList()
  const fieldIdByNameMap: Record<string, string> = {}
  for (const m of metas) {
    fieldIdByNameMap[m.name] = m.id
  }

  async function ensureField(
    name: string,
    type: FieldType.Text | FieldType.Number,
  ): Promise<string> {
    if (fieldIdByNameMap[name]) return fieldIdByNameMap[name]
    const id = await detailTable.addField({
      name,
      type,
    })
    fieldIdByNameMap[name] = id
    return id
  }

  const mainUrlFieldId = await ensureField('主页链接', FieldType.Text)
  let secUidFieldId = ''
  let awemeIdFieldId = ''
  if (WRITE_DETAIL_USER_AND_WORK_IDS) {
    secUidFieldId = await ensureField('sec_uid', FieldType.Text)
    awemeIdFieldId = await ensureField('aweme_id', FieldType.Text)
  }
  const workUrlFieldId = await ensureField('作品链接', FieldType.Text)
  const descFieldId = await ensureField('文案', FieldType.Text)
  const publishAtFieldId = await ensureField('发布时间', FieldType.Text)
  let workTypeFieldId = ''
  if (WRITE_DETAIL_CONTENT_TYPE) {
    workTypeFieldId = await ensureField('内容类型', FieldType.Text)
  }
  const crawlDateFieldId = await ensureField('抓取日期', FieldType.Text)

  return {
    detailTable,
    fieldIds: {
      mainUrlFieldId,
      secUidFieldId,
      awemeIdFieldId,
      workUrlFieldId,
      descFieldId,
      publishAtFieldId,
      workTypeFieldId,
      crawlDateFieldId,
    },
  }
}

async function ensureXhsDetailTable(tableName: string) {
  const name = tableName.trim() || XHS_DETAIL_TABLE_NAME_DEFAULT
  const tableMetaList = await bitable.base.getTableMetaList()
  let tableMeta = tableMetaList.find((t) => t.name === name)
  if (!tableMeta) {
    const created = await bitable.base.addTable({
      name,
      fields: [
        { name: '主页链接', type: FieldType.Text },
        ...(WRITE_DETAIL_USER_AND_WORK_IDS
          ? ([
              { name: 'user_id', type: FieldType.Text },
              { name: 'note_id', type: FieldType.Text },
            ] as DetailTextCol[])
          : []),
        { name: '笔记链接', type: FieldType.Text },
        { name: '文案', type: FieldType.Text },
        { name: '发布时间', type: FieldType.Text },
        ...(WRITE_DETAIL_CONTENT_TYPE
          ? ([{ name: '内容类型', type: FieldType.Text }] as DetailTextCol[])
          : []),
        { name: '抓取日期', type: FieldType.Text },
      ],
    })
    tableMeta = { id: created.tableId, name }
  }
  const detailTable = await bitable.base.getTableById(tableMeta.id)
  const metas = await detailTable.getFieldMetaList()
  const fieldIdByNameMap: Record<string, string> = {}
  for (const m of metas) {
    fieldIdByNameMap[m.name] = m.id
  }

  async function ensureField(
    name: string,
    type: FieldType.Text | FieldType.Number,
  ): Promise<string> {
    if (fieldIdByNameMap[name]) return fieldIdByNameMap[name]
    const id = await detailTable.addField({
      name,
      type,
    })
    fieldIdByNameMap[name] = id
    return id
  }

  const mainUrlFieldId = await ensureField('主页链接', FieldType.Text)
  let userIdFieldId = ''
  let noteIdFieldId = ''
  if (WRITE_DETAIL_USER_AND_WORK_IDS) {
    userIdFieldId = await ensureField('user_id', FieldType.Text)
    noteIdFieldId = await ensureField('note_id', FieldType.Text)
  }
  const noteUrlFieldId = await ensureField('笔记链接', FieldType.Text)
  const descFieldId = await ensureField('文案', FieldType.Text)
  const publishAtFieldId = await ensureField('发布时间', FieldType.Text)
  let noteTypeFieldId = ''
  if (WRITE_DETAIL_CONTENT_TYPE) {
    noteTypeFieldId = await ensureField('内容类型', FieldType.Text)
  }
  const crawlDateFieldId = await ensureField('抓取日期', FieldType.Text)

  return {
    detailTable,
    fieldIds: {
      mainUrlFieldId,
      userIdFieldId,
      noteIdFieldId,
      noteUrlFieldId,
      descFieldId,
      publishAtFieldId,
      noteTypeFieldId,
      crawlDateFieldId,
    },
  }
}

async function ensureAutohomeDetailTable(tableName: string) {
  const name = tableName.trim() || AH_DETAIL_TABLE_NAME_DEFAULT
  const tableMetaList = await bitable.base.getTableMetaList()
  let tableMeta = tableMetaList.find((t) => t.name === name)
  if (!tableMeta) {
    const created = await bitable.base.addTable({
      name,
      fields: [
        { name: '主页链接', type: FieldType.Text },
        ...(WRITE_DETAIL_USER_AND_WORK_IDS
          ? ([
              { name: 'uid', type: FieldType.Text },
              { name: 'topic_id', type: FieldType.Text },
            ] as DetailTextCol[])
          : []),
        { name: '帖子链接', type: FieldType.Text },
        { name: '文案', type: FieldType.Text },
        { name: '发布时间', type: FieldType.Text },
        ...(WRITE_DETAIL_CONTENT_TYPE
          ? ([{ name: '内容类型', type: FieldType.Text }] as DetailTextCol[])
          : []),
        { name: '抓取日期', type: FieldType.Text },
      ],
    })
    tableMeta = { id: created.tableId, name }
  }
  const detailTable = await bitable.base.getTableById(tableMeta.id)
  const metas = await detailTable.getFieldMetaList()
  const fieldIdByNameMap: Record<string, string> = {}
  for (const m of metas) {
    fieldIdByNameMap[m.name] = m.id
  }

  async function ensureField(
    name: string,
    type: FieldType.Text | FieldType.Number,
  ): Promise<string> {
    if (fieldIdByNameMap[name]) return fieldIdByNameMap[name]
    const id = await detailTable.addField({
      name,
      type,
    })
    fieldIdByNameMap[name] = id
    return id
  }

  const mainUrlFieldId = await ensureField('主页链接', FieldType.Text)
  let uidFieldId = ''
  let topicIdFieldId = ''
  if (WRITE_DETAIL_USER_AND_WORK_IDS) {
    uidFieldId = await ensureField('uid', FieldType.Text)
    topicIdFieldId = await ensureField('topic_id', FieldType.Text)
  }
  const threadUrlFieldId = await ensureField('帖子链接', FieldType.Text)
  const descFieldId = await ensureField('文案', FieldType.Text)
  const publishAtFieldId = await ensureField('发布时间', FieldType.Text)
  let contentTypeFieldId = ''
  if (WRITE_DETAIL_CONTENT_TYPE) {
    contentTypeFieldId = await ensureField('内容类型', FieldType.Text)
  }
  const crawlDateFieldId = await ensureField('抓取日期', FieldType.Text)

  return {
    detailTable,
    fieldIds: {
      mainUrlFieldId,
      uidFieldId,
      topicIdFieldId,
      threadUrlFieldId,
      descFieldId,
      publishAtFieldId,
      contentTypeFieldId,
      crawlDateFieldId,
    },
  }
}

async function ensureDongchediDetailTable(tableName: string) {
  const name = tableName.trim() || DC_DETAIL_TABLE_NAME_DEFAULT
  const tableMetaList = await bitable.base.getTableMetaList()
  let tableMeta = tableMetaList.find((t) => t.name === name)
  if (!tableMeta) {
    const created = await bitable.base.addTable({
      name,
      fields: [
        { name: '主页链接', type: FieldType.Text },
        ...(WRITE_DETAIL_USER_AND_WORK_IDS
          ? ([
              { name: 'user_id', type: FieldType.Text },
              { name: 'article_id', type: FieldType.Text },
            ] as DetailTextCol[])
          : []),
        { name: '文章链接', type: FieldType.Text },
        { name: '文案', type: FieldType.Text },
        { name: '发布时间', type: FieldType.Text },
        ...(WRITE_DETAIL_CONTENT_TYPE
          ? ([{ name: '内容类型', type: FieldType.Text }] as DetailTextCol[])
          : []),
        { name: '抓取日期', type: FieldType.Text },
      ],
    })
    tableMeta = { id: created.tableId, name }
  }
  const detailTable = await bitable.base.getTableById(tableMeta.id)
  const metas = await detailTable.getFieldMetaList()
  const fieldIdByNameMap: Record<string, string> = {}
  for (const m of metas) {
    fieldIdByNameMap[m.name] = m.id
  }

  async function ensureField(
    name: string,
    type: FieldType.Text | FieldType.Number,
  ): Promise<string> {
    if (fieldIdByNameMap[name]) return fieldIdByNameMap[name]
    const id = await detailTable.addField({
      name,
      type,
    })
    fieldIdByNameMap[name] = id
    return id
  }

  const mainUrlFieldId = await ensureField('主页链接', FieldType.Text)
  let userIdFieldId = ''
  let articleIdFieldId = ''
  if (WRITE_DETAIL_USER_AND_WORK_IDS) {
    userIdFieldId = await ensureField('user_id', FieldType.Text)
    articleIdFieldId = await ensureField('article_id', FieldType.Text)
  }
  const articleUrlFieldId = await ensureField('文章链接', FieldType.Text)
  const descFieldId = await ensureField('文案', FieldType.Text)
  const publishAtFieldId = await ensureField('发布时间', FieldType.Text)
  let dcContentTypeFieldId = ''
  if (WRITE_DETAIL_CONTENT_TYPE) {
    dcContentTypeFieldId = await ensureField('内容类型', FieldType.Text)
  }
  const crawlDateFieldId = await ensureField('抓取日期', FieldType.Text)

  return {
    detailTable,
    fieldIds: {
      mainUrlFieldId,
      userIdFieldId,
      articleIdFieldId,
      articleUrlFieldId,
      descFieldId,
      publishAtFieldId,
      contentTypeFieldId: dcContentTypeFieldId,
      crawlDateFieldId,
    },
  }
}

async function ensureYicheDetailTable(tableName: string) {
  const name = tableName.trim() || YI_DETAIL_TABLE_NAME_DEFAULT
  const tableMetaList = await bitable.base.getTableMetaList()
  let tableMeta = tableMetaList.find((t) => t.name === name)
  if (!tableMeta) {
    const created = await bitable.base.addTable({
      name,
      fields: [
        { name: '主页链接', type: FieldType.Text },
        ...(WRITE_DETAIL_USER_AND_WORK_IDS
          ? ([
              { name: 'user_id', type: FieldType.Text },
              { name: 'post_id', type: FieldType.Text },
            ] as DetailTextCol[])
          : []),
        { name: '内容链接', type: FieldType.Text },
        { name: '文案', type: FieldType.Text },
        { name: '发布时间', type: FieldType.Text },
        ...(WRITE_DETAIL_CONTENT_TYPE
          ? ([{ name: '内容类型', type: FieldType.Text }] as DetailTextCol[])
          : []),
        { name: '抓取日期', type: FieldType.Text },
      ],
    })
    tableMeta = { id: created.tableId, name }
  }
  const detailTable = await bitable.base.getTableById(tableMeta.id)
  const metas = await detailTable.getFieldMetaList()
  const fieldIdByNameMap: Record<string, string> = {}
  for (const m of metas) {
    fieldIdByNameMap[m.name] = m.id
  }

  async function ensureField(
    name: string,
    type: FieldType.Text | FieldType.Number,
  ): Promise<string> {
    if (fieldIdByNameMap[name]) return fieldIdByNameMap[name]
    const id = await detailTable.addField({
      name,
      type,
    })
    fieldIdByNameMap[name] = id
    return id
  }

  const mainUrlFieldId = await ensureField('主页链接', FieldType.Text)
  let userIdFieldId = ''
  let postIdFieldId = ''
  if (WRITE_DETAIL_USER_AND_WORK_IDS) {
    userIdFieldId = await ensureField('user_id', FieldType.Text)
    postIdFieldId = await ensureField('post_id', FieldType.Text)
  }
  const postUrlFieldId = await ensureField('内容链接', FieldType.Text)
  const descFieldId = await ensureField('文案', FieldType.Text)
  const publishAtFieldId = await ensureField('发布时间', FieldType.Text)
  let yiContentTypeFieldId = ''
  if (WRITE_DETAIL_CONTENT_TYPE) {
    yiContentTypeFieldId = await ensureField('内容类型', FieldType.Text)
  }
  const crawlDateFieldId = await ensureField('抓取日期', FieldType.Text)

  return {
    detailTable,
    fieldIds: {
      mainUrlFieldId,
      userIdFieldId,
      postIdFieldId,
      postUrlFieldId,
      descFieldId,
      publishAtFieldId,
      contentTypeFieldId: yiContentTypeFieldId,
      crawlDateFieldId,
    },
  }
}

async function writeDyMainTableSyncDate(
  table: ActiveTable,
  fieldId: string | undefined,
  crawlDateText: string,
  rid: string,
) {
  if (!fieldId) return
  const meta = await table.getFieldMetaById(fieldId)
  if (meta.type === FieldType.DateTime) {
    const f = await table.getField<IDateTimeField>(fieldId)
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    await f.setValue(rid, d.getTime())
    return
  }
  if (meta.type === FieldType.Text) {
    const f = await table.getField<ITextField>(fieldId)
    await f.setValue(rid, crawlDateText)
  }
}

async function buildAwemeIdToRecordIdMap(
  detailTable: Awaited<ReturnType<(typeof bitable.base)['getTableById']>>,
  awemeIdFieldId: string,
): Promise<Map<string, string>> {
  if (!awemeIdFieldId.trim()) return new Map()
  const map = new Map<string, string>()
  const recordIds = await detailTable.getRecordIdList()
  for (const rid of recordIds) {
    const key = (await detailTable.getCellString(awemeIdFieldId, rid)).trim()
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, rid)
    }
  }
  return map
}

async function buildNoteIdToRecordIdMap(
  detailTable: Awaited<ReturnType<(typeof bitable.base)['getTableById']>>,
  noteIdFieldId: string,
): Promise<Map<string, string>> {
  if (!noteIdFieldId.trim()) return new Map()
  const map = new Map<string, string>()
  const recordIds = await detailTable.getRecordIdList()
  for (const rid of recordIds) {
    const key = (await detailTable.getCellString(noteIdFieldId, rid)).trim()
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, rid)
    }
  }
  return map
}

async function buildTopicIdToRecordIdMap(
  detailTable: Awaited<ReturnType<(typeof bitable.base)['getTableById']>>,
  topicIdFieldId: string,
): Promise<Map<string, string>> {
  if (!topicIdFieldId.trim()) return new Map()
  const map = new Map<string, string>()
  const recordIds = await detailTable.getRecordIdList()
  for (const rid of recordIds) {
    const key = (await detailTable.getCellString(topicIdFieldId, rid)).trim()
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, rid)
    }
  }
  return map
}

async function buildArticleIdToRecordIdMap(
  detailTable: Awaited<ReturnType<(typeof bitable.base)['getTableById']>>,
  articleIdFieldId: string,
): Promise<Map<string, string>> {
  if (!articleIdFieldId.trim()) return new Map()
  const map = new Map<string, string>()
  const recordIds = await detailTable.getRecordIdList()
  for (const rid of recordIds) {
    const key = (await detailTable.getCellString(articleIdFieldId, rid)).trim()
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, rid)
    }
  }
  return map
}

async function buildYichePostIdToRecordIdMap(
  detailTable: Awaited<ReturnType<(typeof bitable.base)['getTableById']>>,
  postIdFieldId: string,
): Promise<Map<string, string>> {
  if (!postIdFieldId.trim()) return new Map()
  const map = new Map<string, string>()
  const recordIds = await detailTable.getRecordIdList()
  for (const rid of recordIds) {
    const key = (await detailTable.getCellString(postIdFieldId, rid)).trim()
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, rid)
    }
  }
  return map
}

export async function runBatchLinkSync(config: BatchLinkSyncConfig): Promise<{
  errors: string[]
  total: number
  skippedEmpty: number
  skippedUnsupported: number
  skippedNoWriteback: number
  douyinOk: number
  xhsOk: number
  autohomeOk: number
  dongchediOk: number
  yicheOk: number
}> {
  const table = await bitable.base.getActiveTable()
  const linkField = await table.getField(config.linkFieldId)
  const isDyWritebackEnabled = Boolean(
    config.dySyncDateFieldId || config.dyTodayCountId,
  )
  const isXhsWritebackEnabled = Boolean(
    config.xhsSyncDateFieldId || config.xhsTodayCountId,
  )
  const isAhWritebackEnabled = Boolean(
    config.ahSyncDateFieldId || config.ahTodayCountId,
  )
  const isDcWritebackEnabled = Boolean(
    config.dcSyncDateFieldId || config.dcTodayCountId,
  )
  const isYiWritebackEnabled = Boolean(
    config.yiSyncDateFieldId || config.yiTodayCountId,
  )

  const dyDetailCtx = isDyWritebackEnabled
    ? await ensureDouyinDetailTable(
        config.dyDetailTableName || DY_DETAIL_TABLE_NAME_DEFAULT,
      )
    : null
  const xhsDetailCtx = isXhsWritebackEnabled
    ? await ensureXhsDetailTable(
        config.xhsDetailTableName || XHS_DETAIL_TABLE_NAME_DEFAULT,
      )
    : null
  const awemeIdToRecordIdMap =
    isDyWritebackEnabled && dyDetailCtx
      ? await buildAwemeIdToRecordIdMap(
          dyDetailCtx.detailTable,
          dyDetailCtx.fieldIds.awemeIdFieldId,
        )
      : new Map<string, string>()
  const noteIdToRecordIdMap =
    isXhsWritebackEnabled && xhsDetailCtx
      ? await buildNoteIdToRecordIdMap(
          xhsDetailCtx.detailTable,
          xhsDetailCtx.fieldIds.noteIdFieldId,
        )
      : new Map<string, string>()
  const ahDetailCtx = isAhWritebackEnabled
    ? await ensureAutohomeDetailTable(
        config.ahDetailTableName || AH_DETAIL_TABLE_NAME_DEFAULT,
      )
    : null
  const topicIdToRecordIdMap =
    isAhWritebackEnabled && ahDetailCtx
      ? await buildTopicIdToRecordIdMap(
          ahDetailCtx.detailTable,
          ahDetailCtx.fieldIds.topicIdFieldId,
        )
      : new Map<string, string>()
  const dcDetailCtx = isDcWritebackEnabled
    ? await ensureDongchediDetailTable(
        config.dcDetailTableName || DC_DETAIL_TABLE_NAME_DEFAULT,
      )
    : null
  const articleIdToRecordIdMap =
    isDcWritebackEnabled && dcDetailCtx
      ? await buildArticleIdToRecordIdMap(
          dcDetailCtx.detailTable,
          dcDetailCtx.fieldIds.articleIdFieldId,
        )
      : new Map<string, string>()
  const yiDetailCtx = isYiWritebackEnabled
    ? await ensureYicheDetailTable(
        config.yiDetailTableName || YI_DETAIL_TABLE_NAME_DEFAULT,
      )
    : null
  const yichePostIdToRecordIdMap =
    isYiWritebackEnabled && yiDetailCtx
      ? await buildYichePostIdToRecordIdMap(
          yiDetailCtx.detailTable,
          yiDetailCtx.fieldIds.postIdFieldId,
        )
      : new Map<string, string>()
  const dyWorkUrlToRecordIdMap =
    isDyWritebackEnabled && dyDetailCtx
      ? await buildWorkUrlToRecordIdMap(
          dyDetailCtx.detailTable,
          dyDetailCtx.fieldIds.workUrlFieldId,
        )
      : new Map<string, string>()
  const xhsNoteUrlToRecordIdMap =
    isXhsWritebackEnabled && xhsDetailCtx
      ? await buildWorkUrlToRecordIdMap(
          xhsDetailCtx.detailTable,
          xhsDetailCtx.fieldIds.noteUrlFieldId,
        )
      : new Map<string, string>()
  const ahThreadUrlToRecordIdMap =
    isAhWritebackEnabled && ahDetailCtx
      ? await buildWorkUrlToRecordIdMap(
          ahDetailCtx.detailTable,
          ahDetailCtx.fieldIds.threadUrlFieldId,
        )
      : new Map<string, string>()
  const dcArticleUrlToRecordIdMap =
    isDcWritebackEnabled && dcDetailCtx
      ? await buildWorkUrlToRecordIdMap(
          dcDetailCtx.detailTable,
          dcDetailCtx.fieldIds.articleUrlFieldId,
        )
      : new Map<string, string>()
  const yiPostUrlToRecordIdMap =
    isYiWritebackEnabled && yiDetailCtx
      ? await buildWorkUrlToRecordIdMap(
          yiDetailCtx.detailTable,
          yiDetailCtx.fieldIds.postUrlFieldId,
        )
      : new Map<string, string>()
  const recordIds = await getRecordIdsTopToBottom(table)
  const errors: string[] = []
  let skippedEmpty = 0
  let skippedUnsupported = 0
  let skippedNoWriteback = 0
  let douyinOk = 0
  let xhsOk = 0
  let autohomeOk = 0
  let dongchediOk = 0
  let yicheOk = 0
  const minGapDyXhsMs = Math.max(
    config.delayMs ?? MIN_GAP_DYXHS_MS,
    MIN_GAP_DYXHS_MS,
  )
  const minGapCarMs = Math.max(
    config.delayMs ?? MIN_GAP_CAR_MS,
    MIN_GAP_CAR_MS,
  )
  let lastDouyinRequestEndAt = 0
  let lastXhsRequestEndAt = 0
  let lastAutohomeRequestEndAt = 0
  let lastDongchediRequestEndAt = 0
  let lastYicheRequestEndAt = 0
  let done = 0
  const total = recordIds.length

  for (const rid of recordIds) {
    const urlRaw = (await linkField.getCellString(rid)).trim()
    if (!urlRaw) {
      skippedEmpty++
      done++
      config.onProgress?.(done, total, rid)
      continue
    }

    const isDy = isObviousDouyinUserUrl(urlRaw)
    const isXhs = isObviousXhsUserUrl(urlRaw)
    const isAh = isObviousAutohomeAuthorUrl(urlRaw)
    const isDc = isObviousDongchediArticleUrl(urlRaw)
    const isYi = isObviousYichePageUrl(urlRaw)

    if (isDy) {
      if (!isDyWritebackEnabled || !dyDetailCtx) {
        skippedNoWriteback++
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      if (!config.douyinCookie.trim()) {
        errors.push(`${rid}: 抖音主页链接但未填写抖音 Cookie`)
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      try {
        await sleepUntilPlatformGap(lastDouyinRequestEndAt, minGapDyXhsMs)
        const data = await fetchDouyinUserTodayPosts(urlRaw, config.douyinCookie)
        const crawlDate = getTodayDateText()

        for (const item of data.todayPosts) {
          const recordValue = {
            fields: {
              [dyDetailCtx.fieldIds.mainUrlFieldId]: urlRaw,
              ...(WRITE_DETAIL_USER_AND_WORK_IDS
                ? {
                    [dyDetailCtx.fieldIds.secUidFieldId]: data.secUserId || '',
                    [dyDetailCtx.fieldIds.awemeIdFieldId]: item.awemeId,
                  }
                : {}),
              [dyDetailCtx.fieldIds.workUrlFieldId]: item.workUrl,
              [dyDetailCtx.fieldIds.descFieldId]: item.desc || '',
              [dyDetailCtx.fieldIds.publishAtFieldId]: formatDateTime(
                item.createTime,
              ),
              ...(WRITE_DETAIL_CONTENT_TYPE
                ? {
                    [dyDetailCtx.fieldIds.workTypeFieldId]:
                      item.workType === 'note' ? '图文' : '视频',
                  }
                : {}),
              [dyDetailCtx.fieldIds.crawlDateFieldId]: crawlDate,
            },
          }
          const urlKey = normalizeWorkUrlForDedupe(item.workUrl)
          const existingRid =
            awemeIdToRecordIdMap.get(item.awemeId) ??
            dyWorkUrlToRecordIdMap.get(urlKey)
          if (existingRid) {
            await dyDetailCtx.detailTable.setRecord(existingRid, recordValue)
          } else {
            const newRid = await dyDetailCtx.detailTable.addRecord(recordValue)
            if (item.awemeId) {
              awemeIdToRecordIdMap.set(item.awemeId, newRid)
            }
            dyWorkUrlToRecordIdMap.set(urlKey, newRid)
          }
        }

        await writeDyMainTableSyncDate(
          table,
          config.dySyncDateFieldId,
          crawlDate,
          rid,
        )
        if (config.dyTodayCountId) {
          const f = await table.getField<INumberField>(config.dyTodayCountId)
          await f.setValue(rid, data.todayPosts.length)
        }
        douyinOk++
      } catch (e) {
        errors.push(`${rid}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        lastDouyinRequestEndAt = Date.now()
      }
      done++
      config.onProgress?.(done, total, rid)
      continue
    }

    if (isXhs) {
      if (!isXhsWritebackEnabled || !xhsDetailCtx) {
        skippedNoWriteback++
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      if (!config.xhsCookie.trim()) {
        errors.push(`${rid}: 小红书主页链接但未填写小红书 Cookie`)
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      try {
        await sleepUntilPlatformGap(lastXhsRequestEndAt, minGapDyXhsMs)
        const data = await fetchXhsUserTodayPosts(urlRaw, config.xhsCookie)
        const crawlDate = getTodayDateText()

        for (const item of data.todayPosts) {
          const recordValue = {
            fields: {
              [xhsDetailCtx.fieldIds.mainUrlFieldId]: urlRaw,
              ...(WRITE_DETAIL_USER_AND_WORK_IDS
                ? {
                    [xhsDetailCtx.fieldIds.userIdFieldId]: data.userId || '',
                    [xhsDetailCtx.fieldIds.noteIdFieldId]: item.noteId,
                  }
                : {}),
              [xhsDetailCtx.fieldIds.noteUrlFieldId]: item.noteUrl,
              [xhsDetailCtx.fieldIds.descFieldId]: item.desc || '',
              [xhsDetailCtx.fieldIds.publishAtFieldId]: formatDateTime(
                item.createTime,
              ),
              ...(WRITE_DETAIL_CONTENT_TYPE
                ? {
                    [xhsDetailCtx.fieldIds.noteTypeFieldId]: item.noteType || '',
                  }
                : {}),
              [xhsDetailCtx.fieldIds.crawlDateFieldId]: crawlDate,
            },
          }
          const urlKey = normalizeWorkUrlForDedupe(item.noteUrl)
          const existingRid =
            noteIdToRecordIdMap.get(item.noteId) ??
            xhsNoteUrlToRecordIdMap.get(urlKey)
          if (existingRid) {
            await xhsDetailCtx.detailTable.setRecord(existingRid, recordValue)
          } else {
            const newRid = await xhsDetailCtx.detailTable.addRecord(recordValue)
            if (item.noteId) {
              noteIdToRecordIdMap.set(item.noteId, newRid)
            }
            xhsNoteUrlToRecordIdMap.set(urlKey, newRid)
          }
        }

        await writeDyMainTableSyncDate(
          table,
          config.xhsSyncDateFieldId,
          crawlDate,
          rid,
        )
        if (config.xhsTodayCountId) {
          const f = await table.getField<INumberField>(config.xhsTodayCountId)
          await f.setValue(rid, data.todayPosts.length)
        }
        xhsOk++
      } catch (e) {
        errors.push(`${rid}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        lastXhsRequestEndAt = Date.now()
      }
      done++
      config.onProgress?.(done, total, rid)
      continue
    }

    if (isAh) {
      if (!isAhWritebackEnabled || !ahDetailCtx) {
        skippedNoWriteback++
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      try {
        await sleepUntilPlatformGap(lastAutohomeRequestEndAt, minGapCarMs)
        const data = await fetchAutohomeUserTodayPosts(urlRaw)
        const crawlDate = getTodayDateText()

        for (const item of data.todayPosts) {
          const contentType = [item.topicType, item.bbsName]
            .filter(Boolean)
            .join(' · ')
          const recordValue = {
            fields: {
              [ahDetailCtx.fieldIds.mainUrlFieldId]: urlRaw,
              ...(WRITE_DETAIL_USER_AND_WORK_IDS
                ? {
                    [ahDetailCtx.fieldIds.uidFieldId]: data.uid || '',
                    [ahDetailCtx.fieldIds.topicIdFieldId]: item.topicId,
                  }
                : {}),
              [ahDetailCtx.fieldIds.threadUrlFieldId]: item.threadUrl,
              [ahDetailCtx.fieldIds.descFieldId]: item.bodyText || item.title || '',
              [ahDetailCtx.fieldIds.publishAtFieldId]: item.postAtText,
              ...(WRITE_DETAIL_CONTENT_TYPE
                ? { [ahDetailCtx.fieldIds.contentTypeFieldId]: contentType }
                : {}),
              [ahDetailCtx.fieldIds.crawlDateFieldId]: crawlDate,
            },
          }
          const urlKey = normalizeWorkUrlForDedupe(item.threadUrl)
          const existingRid =
            topicIdToRecordIdMap.get(item.topicId) ??
            ahThreadUrlToRecordIdMap.get(urlKey)
          if (existingRid) {
            await ahDetailCtx.detailTable.setRecord(existingRid, recordValue)
          } else {
            const newRid = await ahDetailCtx.detailTable.addRecord(recordValue)
            if (item.topicId) {
              topicIdToRecordIdMap.set(item.topicId, newRid)
            }
            ahThreadUrlToRecordIdMap.set(urlKey, newRid)
          }
        }

        await writeDyMainTableSyncDate(
          table,
          config.ahSyncDateFieldId,
          crawlDate,
          rid,
        )
        if (config.ahTodayCountId) {
          const f = await table.getField<INumberField>(config.ahTodayCountId)
          await f.setValue(rid, data.todayPosts.length)
        }
        autohomeOk++
      } catch (e) {
        errors.push(`${rid}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        lastAutohomeRequestEndAt = Date.now()
      }
      done++
      config.onProgress?.(done, total, rid)
      continue
    }

    if (isDc) {
      if (!isDcWritebackEnabled || !dcDetailCtx) {
        skippedNoWriteback++
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      try {
        await sleepUntilPlatformGap(lastDongchediRequestEndAt, minGapCarMs)
        const data = await fetchDongchediUserTodayPosts(urlRaw)
        const crawlDate = getTodayDateText()

        for (const item of data.todayPosts) {
          const recordValue = {
            fields: {
              [dcDetailCtx.fieldIds.mainUrlFieldId]: urlRaw,
              ...(WRITE_DETAIL_USER_AND_WORK_IDS
                ? {
                    [dcDetailCtx.fieldIds.userIdFieldId]: data.userId || '',
                    [dcDetailCtx.fieldIds.articleIdFieldId]: item.articleId,
                  }
                : {}),
              [dcDetailCtx.fieldIds.articleUrlFieldId]: item.articleUrl,
              [dcDetailCtx.fieldIds.descFieldId]: item.bodyText || item.title || '',
              [dcDetailCtx.fieldIds.publishAtFieldId]: formatDateTime(item.createTime),
              ...(WRITE_DETAIL_CONTENT_TYPE
                ? {
                    [dcDetailCtx.fieldIds.contentTypeFieldId]:
                      item.contentType || '',
                  }
                : {}),
              [dcDetailCtx.fieldIds.crawlDateFieldId]: crawlDate,
            },
          }
          const urlKey = normalizeWorkUrlForDedupe(item.articleUrl)
          const existingRid =
            articleIdToRecordIdMap.get(item.articleId) ??
            dcArticleUrlToRecordIdMap.get(urlKey)
          if (existingRid) {
            await dcDetailCtx.detailTable.setRecord(existingRid, recordValue)
          } else {
            const newRid = await dcDetailCtx.detailTable.addRecord(recordValue)
            if (item.articleId) {
              articleIdToRecordIdMap.set(item.articleId, newRid)
            }
            dcArticleUrlToRecordIdMap.set(urlKey, newRid)
          }
        }

        await writeDyMainTableSyncDate(table, config.dcSyncDateFieldId, crawlDate, rid)
        if (config.dcTodayCountId) {
          const f = await table.getField<INumberField>(config.dcTodayCountId)
          await f.setValue(rid, data.todayPosts.length)
        }
        dongchediOk++
      } catch (e) {
        errors.push(`${rid}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        lastDongchediRequestEndAt = Date.now()
      }
      done++
      config.onProgress?.(done, total, rid)
      continue
    }

    if (isYi) {
      if (!isYiWritebackEnabled || !yiDetailCtx) {
        skippedNoWriteback++
        done++
        config.onProgress?.(done, total, rid)
        continue
      }
      try {
        await sleepUntilPlatformGap(lastYicheRequestEndAt, minGapCarMs)
        const data = await fetchYicheUserTodayPosts(urlRaw)
        const crawlDate = getTodayDateText()

        for (const item of data.todayPosts) {
          const recordValue = {
            fields: {
              [yiDetailCtx.fieldIds.mainUrlFieldId]: urlRaw,
              ...(WRITE_DETAIL_USER_AND_WORK_IDS
                ? {
                    [yiDetailCtx.fieldIds.userIdFieldId]: data.userId || '',
                    [yiDetailCtx.fieldIds.postIdFieldId]: item.postId,
                  }
                : {}),
              [yiDetailCtx.fieldIds.postUrlFieldId]: item.postUrl,
              [yiDetailCtx.fieldIds.descFieldId]: item.bodyText || item.title || '',
              [yiDetailCtx.fieldIds.publishAtFieldId]: item.postAtText || '',
              ...(WRITE_DETAIL_CONTENT_TYPE
                ? {
                    [yiDetailCtx.fieldIds.contentTypeFieldId]:
                      item.contentType || '',
                  }
                : {}),
              [yiDetailCtx.fieldIds.crawlDateFieldId]: crawlDate,
            },
          }
          const urlKey = normalizeWorkUrlForDedupe(item.postUrl)
          const existingRid =
            yichePostIdToRecordIdMap.get(item.postId) ??
            yiPostUrlToRecordIdMap.get(urlKey)
          if (existingRid) {
            await yiDetailCtx.detailTable.setRecord(existingRid, recordValue)
          } else {
            const newRid = await yiDetailCtx.detailTable.addRecord(recordValue)
            if (item.postId) {
              yichePostIdToRecordIdMap.set(item.postId, newRid)
            }
            yiPostUrlToRecordIdMap.set(urlKey, newRid)
          }
        }

        await writeDyMainTableSyncDate(table, config.yiSyncDateFieldId, crawlDate, rid)
        if (config.yiTodayCountId) {
          const f = await table.getField<INumberField>(config.yiTodayCountId)
          await f.setValue(rid, data.todayPosts.length)
        }
        yicheOk++
      } catch (e) {
        errors.push(`${rid}: ${e instanceof Error ? e.message : String(e)}`)
      } finally {
        lastYicheRequestEndAt = Date.now()
      }
      done++
      config.onProgress?.(done, total, rid)
      continue
    }

    skippedUnsupported++
    done++
    config.onProgress?.(done, total, rid)
  }

  return {
    errors,
    total,
    skippedEmpty,
    skippedUnsupported,
    skippedNoWriteback,
    douyinOk,
    xhsOk,
    autohomeOk,
    dongchediOk,
    yicheOk,
  }
}

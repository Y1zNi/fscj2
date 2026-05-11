import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable, FieldType } from '@lark-base-open/js-sdk'
import type { IFieldMeta } from '@lark-base-open/js-sdk'
import {
  Alert,
  Button,
  Card,
  Input,
  Progress,
  Select,
  Space,
  Tabs,
  Typography,
} from 'antd'

import { runBatchLinkSync } from './bitable/runBatchLinkSync'
import { fetchAutohomeUserTodayPosts } from './autohome/fetchUserToday'
import type { AutohomeUserTodayPosts } from './autohome/handleUserToday'
import { isObviousAutohomeAuthorUrl } from './autohome/isAutohomeAuthorUrl'
import { fetchDongchediUserTodayPosts } from './dongchedi/fetchUserToday'
import type { DongchediUserTodayPosts } from './dongchedi/handleUserToday'
import { isObviousDongchediArticleUrl } from './dongchedi/isDongchediArticleUrl'
import { fetchDouyinUserTodayPosts } from './douyin/fetchUserToday'
import type { DouyinUserTodayPosts } from './douyin/handleUserToday'
import { isObviousDouyinUserUrl } from './douyin/isDouyinUserUrl'
import { fetchXhsUserTodayPosts } from './xhs/fetchUserToday'
import type { XhsUserTodayPosts } from './xhs/handleUserToday'
import { isObviousXhsUserUrl } from './xhs/isXhsUserUrl'
import { fetchYicheUserTodayPosts } from './yiche/fetchUserToday'
import type { YicheUserTodayPosts } from './yiche/handleUserToday'
import { isObviousYichePageUrl } from './yiche/isYichePageUrl'
import type { DateScope } from './douyin/fetchUserToday'

const { TextArea } = Input
const { Title, Text } = Typography

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

type SelectOption = { label: string; value: string }

function App() {
  const [bitableReady, setBitableReady] = useState(false)
  const [tableName, setTableName] = useState('')
  const [fieldMetas, setFieldMetas] = useState<IFieldMeta[]>([])
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const [linkFieldId, setLinkFieldId] = useState<string | undefined>()
  const [dyTodayCountId, setDyTodayCountId] = useState<string | undefined>()

  const [xhsTodayCountId, setXhsTodayCountId] = useState<string | undefined>()
  const [xhsFansCountFieldId, setXhsFansCountFieldId] = useState<
    string | undefined
  >()

  const [ahTodayCountId, setAhTodayCountId] = useState<string | undefined>()
  const [dcTodayCountId, setDcTodayCountId] = useState<string | undefined>()
  const [yiTodayCountId, setYiTodayCountId] = useState<string | undefined>()

  const [douyinCookie, setDouyinCookie] = useState('')
  const [xhsCookie, setXhsCookie] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [dateScope, setDateScope] = useState<DateScope>('yesterday')
  const [loading, setLoading] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [batchErrors, setBatchErrors] = useState<string[]>([])
  const [dyStats, setDyStats] = useState<DouyinUserTodayPosts | null>(null)
  const [xhsToday, setXhsToday] = useState<XhsUserTodayPosts | null>(null)
  const [ahToday, setAhToday] = useState<AutohomeUserTodayPosts | null>(null)
  const [dcToday, setDcToday] = useState<DongchediUserTodayPosts | null>(null)
  const [yiToday, setYiToday] = useState<YicheUserTodayPosts | null>(null)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  const scopeLabelMap: Record<DateScope, string> = {
    today: '今天',
    yesterday: '昨天',
    last3Days: '3天内',
    last7Days: '7天内',
    last30Days: '一个月内',
    last90Days: '三个月内',
    last180Days: '半年内',
    last365Days: '一年内',
  }
  const scopeLabel = scopeLabelMap[dateScope]

  const loadTable = useCallback(async () => {
    setLoadErr(null)
    try {
      const table = await bitable.base.getActiveTable()
      const [name, metas] = await Promise.all([
        table.getName(),
        table.getFieldMetaList(),
      ])
      setTableName(name)
      setFieldMetas(metas)
      setBitableReady(true)
    } catch (e) {
      setBitableReady(false)
      setLoadErr(
        e instanceof Error ? e.message : '无法连接多维表格（本地单独打开页面时会出现）',
      )
    }
  }, [])

  useEffect(() => {
    void loadTable()
  }, [loadTable])

  const linkOptions: SelectOption[] = useMemo(
    () =>
      fieldMetas
        .filter(
          (m) => m.type === FieldType.Text || m.type === FieldType.Url,
        )
        .map((m) => ({ label: m.name, value: m.id })),
    [fieldMetas],
  )

  const numberOptions: SelectOption[] = useMemo(
    () =>
      fieldMetas
        .filter((m) => m.type === FieldType.Number)
        .map((m) => ({ label: m.name, value: m.id })),
    [fieldMetas],
  )

  async function handleFetchSingle() {
    setError(null)
    setDyStats(null)
    setXhsToday(null)
    setAhToday(null)
    setDcToday(null)
    setYiToday(null)
    setBatchSummary(null)
    if (!manualUrl.trim()) {
      setError('请填写链接')
      return
    }
    if (isObviousDouyinUserUrl(manualUrl)) {
      if (!douyinCookie.trim()) {
        setError('抖音主页链接请填写「抖音 Cookie」')
        return
      }
      setLoading(true)
      try {
        const data = await fetchDouyinUserTodayPosts(
          manualUrl,
          douyinCookie,
          dateScope,
        )
        setDyStats(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      return
    }
    if (isObviousXhsUserUrl(manualUrl)) {
      if (!xhsCookie.trim()) {
        setError('小红书主页链接请填写「小红书 Cookie」')
        return
      }
      setLoading(true)
      try {
        const data = await fetchXhsUserTodayPosts(manualUrl, xhsCookie, dateScope)
        setXhsToday(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      return
    }
    if (isObviousAutohomeAuthorUrl(manualUrl)) {
      setLoading(true)
      try {
        const data = await fetchAutohomeUserTodayPosts(manualUrl, dateScope)
        setAhToday(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      return
    }
    if (isObviousDongchediArticleUrl(manualUrl)) {
      setLoading(true)
      try {
        const data = await fetchDongchediUserTodayPosts(manualUrl, dateScope)
        setDcToday(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      return
    }
    if (isObviousYichePageUrl(manualUrl)) {
      setLoading(true)
      try {
        const data = await fetchYicheUserTodayPosts(manualUrl, dateScope)
        setYiToday(data)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
      return
    }
    setError(
      '无法识别链接：请使用抖音/小红书用户主页、汽车之家个人主页或论坛主帖列表、懂车帝用户主页或易车用户主页链接',
    )
  }

  async function handleBatchSync() {
    setError(null)
    setDyStats(null)
    setXhsToday(null)
    setAhToday(null)
    setDcToday(null)
    setYiToday(null)
    setBatchErrors([])
    setBatchSummary(null)
    if (!linkFieldId) {
      setError('请选择链接所在列')
      return
    }
    setLoading(true)
    setBatchProgress({ done: 0, total: 0 })
    try {
      const {
        errors,
        total,
        skippedEmpty,
        skippedUnsupported,
        douyinOk,
        xhsOk,
        autohomeOk,
        dongchediOk,
        yicheOk,
      } = await runBatchLinkSync({
        linkFieldId,
        douyinCookie,
        xhsCookie,
        dyTodayCountId,
        xhsTodayCountId,
        xhsFansCountFieldId,
        ahTodayCountId,
        dcTodayCountId,
        yiTodayCountId,
        dateScope,
        onProgress: (done, total_) => {
          setBatchProgress({ done, total: total_ })
        },
      })
      setBatchErrors(errors)
      setBatchSummary(
        `共 ${total} 行，空链跳过 ${skippedEmpty} 行，未识别链接跳过 ${skippedUnsupported} 行，` +
          `抖音 ${douyinOk} 条，小红书 ${xhsOk} 条，汽车之家 ${autohomeOk} 条，` +
          `懂车帝 ${dongchediOk} 条，易车 ${yicheOk} 条，失败 ${errors.length} 行`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setBatchProgress(null)
    }
  }

  return (
    <div
      style={{
        padding: '16px 18px 24px',
        maxWidth: 640,
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      <Title level={4} style={{ marginTop: 0, marginBottom: 14 }}>
        多平台链接数据同步
      </Title>

      {loadErr ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="未检测到多维表格环境"
          description={loadErr}
        />
      ) : null}

      {bitableReady ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
          message={tableName ? `当前数据表：${tableName}` : '已连接多维表格'}
        />
      ) : null}

      <Space direction="vertical" size={14} style={{ width: '100%' }}>
        {bitableReady ? (
          <Card
            size="small"
            title="抓取与写回"
            bodyStyle={{ paddingTop: 12, paddingBottom: 16 }}
          >
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 2,
                marginBottom: 12,
                paddingBottom: 12,
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                background: '#fff',
              }}
            >
              <Text
                type="secondary"
                style={{ display: 'block', marginBottom: 10, fontSize: 12 }}
              >
                同一列可混排各平台链接。切换标签配置写回列；未选列则该项不落表。
                主表「同步日期」写回已暂时关闭；范围内更新数、明细子表写回按各 Tab 映射执行；小红书「博主粉丝数」仅映射该列时才请求并写回。
                明细表每次执行都会新建，命名规则为「平台名_时间范围_执行时间」。
              </Text>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>抓取日期范围</div>
              <Select
                style={{ width: '100%', marginBottom: 10 }}
                value={dateScope}
                onChange={(v) => setDateScope(v as DateScope)}
                options={[
                  { label: '一年内', value: 'last365Days' },
                  { label: '半年内', value: 'last180Days' },
                  { label: '三个月内', value: 'last90Days' },
                  { label: '一个月内', value: 'last30Days' },
                  { label: '7天内', value: 'last7Days' },
                  { label: '3天内', value: 'last3Days' },
                  { label: '昨天（00:00-24:00）', value: 'yesterday' },
                  { label: '今天（00:00-24:00）', value: 'today' },
                ]}
              />
              <div style={{ marginBottom: 6, fontWeight: 500 }}>链接列</div>
              <Select
                style={{ width: '100%' }}
                placeholder="选择文本或链接类型的列"
                options={linkOptions}
                value={linkFieldId}
                onChange={setLinkFieldId}
                allowClear
                showSearch
                optionFilterProp="label"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <Tabs
                size="small"
                defaultActiveKey="dy"
                tabBarStyle={{ marginBottom: 8 }}
                items={[
                {
                  key: 'dy',
                  label: '抖音',
                  children: (
                    <MappingFieldScroll>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <FieldSelect
                          label="范围内更新数（主表：数字列）"
                          options={numberOptions}
                          value={dyTodayCountId}
                          onChange={setDyTodayCountId}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          明细子表自动命名：平台名_时间范围_执行时间
                        </Text>
                      </Space>
                    </MappingFieldScroll>
                  ),
                },
                {
                  key: 'xhs',
                  label: '小红书',
                  children: (
                    <MappingFieldScroll>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <FieldSelect
                          label="范围内更新数（主表：数字列）"
                          options={numberOptions}
                          value={xhsTodayCountId}
                          onChange={setXhsTodayCountId}
                        />
                        <FieldSelect
                          label="博主粉丝数（主表：数字列，可选）"
                          options={numberOptions}
                          value={xhsFansCountFieldId}
                          onChange={setXhsFansCountFieldId}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          仅在选择「博主粉丝数」列时才请求 otherinfo；未选则不请求。明细子表命名：平台名_时间范围_执行时间
                        </Text>
                      </Space>
                    </MappingFieldScroll>
                  ),
                },
                {
                  key: 'ah',
                  label: '汽车之家',
                  children: (
                    <MappingFieldScroll>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <FieldSelect
                          label="范围内更新数（主表：数字列）"
                          options={numberOptions}
                          value={ahTodayCountId}
                          onChange={setAhTodayCountId}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          明细子表自动命名：平台名_时间范围_执行时间
                        </Text>
                      </Space>
                    </MappingFieldScroll>
                  ),
                },
                {
                  key: 'dc',
                  label: '懂车帝',
                  children: (
                    <MappingFieldScroll>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <FieldSelect
                          label="范围内更新数（主表：数字列）"
                          options={numberOptions}
                          value={dcTodayCountId}
                          onChange={setDcTodayCountId}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          明细子表自动命名：平台名_时间范围_执行时间
                        </Text>
                      </Space>
                    </MappingFieldScroll>
                  ),
                },
                {
                  key: 'yi',
                  label: '易车',
                  children: (
                    <MappingFieldScroll>
                      <Space
                        direction="vertical"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <FieldSelect
                          label="范围内更新数（主表：数字列）"
                          options={numberOptions}
                          value={yiTodayCountId}
                          onChange={setYiTodayCountId}
                        />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          明细子表自动命名：平台名_时间范围_执行时间
                        </Text>
                      </Space>
                    </MappingFieldScroll>
                  ),
                },
              ]}
              />
            </div>
            <Space direction="vertical" size={10} style={{ width: '100%', marginTop: 4 }}>
              <Button
                type="primary"
                loading={loading}
                onClick={handleBatchSync}
                disabled={!bitableReady}
                block
              >
                按行抓取并写回表格
              </Button>
              {batchProgress && batchProgress.total > 0 ? (
                <Progress
                  percent={Math.round(
                    (100 * batchProgress.done) / batchProgress.total,
                  )}
                  size="small"
                  format={() => `${batchProgress.done}/${batchProgress.total}`}
                />
              ) : null}
            </Space>
            {batchSummary ? (
              <Alert type="info" showIcon message={batchSummary} />
            ) : null}
            {batchErrors.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                message={`部分行失败（${batchErrors.length}）`}
                description={
                  <pre
                    style={{
                      margin: 0,
                      maxHeight: 160,
                      overflow: 'auto',
                      fontSize: 11,
                    }}
                  >
                    {batchErrors.slice(0, 20).join('\n')}
                    {batchErrors.length > 20
                      ? `\n…共 ${batchErrors.length} 条`
                      : ''}
                  </pre>
                }
              />
            ) : null}
          </Card>
        ) : null}

        <Card size="small" title="Cookie" bodyStyle={{ paddingTop: 12 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 12 }}>
            抖音、小红书抓取需要对应 Cookie；懂车帝、易车可不填。
          </Text>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>抖音</div>
              <TextArea
                placeholder="已登录 douyin.com 后的 Cookie（需含 s_v_web_id）"
                value={douyinCookie}
                onChange={(e) => setDouyinCookie(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
              />
            </div>
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>小红书</div>
              <TextArea
                placeholder="已登录 xiaohongshu.com 后的 Cookie（需含 a1）"
                value={xhsCookie}
                onChange={(e) => setXhsCookie(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 6 }}
              />
            </div>
          </Space>
        </Card>

        {!bitableReady ? (
          <Card size="small" title="本地预览" bodyStyle={{ paddingTop: 12 }}>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input
                placeholder="粘贴任意支持平台的链接"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                allowClear
              />
              <Button type="default" loading={loading} onClick={handleFetchSingle} block>
                预览数据（不写表格）
              </Button>
            </Space>
          </Card>
        ) : null}

        {error ? (
          <Alert type="error" message={error} showIcon />
        ) : null}
        {dyStats ? (
          <Card size="small" title={`抖音${scopeLabel}预览`}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">
                {scopeLabel}更新 {dyStats.todayPosts.length} 条
              </Text>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {dyStats.todayPosts
                  .slice(0, 20)
                  .map((item, idx) => {
                    return `${idx + 1}. ${item.workUrl}\n${item.desc || '（无文案）'}`
                  })
                  .join('\n\n')}
              </pre>
            </Space>
          </Card>
        ) : null}
        {xhsToday ? (
          <Card size="small" title={`小红书${scopeLabel}预览`}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">
                {scopeLabel}更新 {xhsToday.todayPosts.length} 条
                {xhsToday.fansCount != null
                  ? ` · 粉丝 ${xhsToday.fansCount}`
                  : ''}
              </Text>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {xhsToday.todayPosts
                  .slice(0, 20)
                  .map((item, idx) => {
                    return `${idx + 1}. ${item.noteUrl}\n${item.desc || '（无文案）'}`
                  })
                  .join('\n\n')}
              </pre>
            </Space>
          </Card>
        ) : null}
        {ahToday ? (
          <Card size="small" title={`汽车之家${scopeLabel}预览`}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">
                uid {ahToday.uid || '—'} · {scopeLabel}发帖 {ahToday.todayPosts.length} 条（文案为 M 站详情正文）
              </Text>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ahToday.todayPosts
                  .slice(0, 20)
                  .map((item, idx) => {
                    const head = item.title || '（无标题）'
                    const body = item.bodyText || head
                    return `${idx + 1}. ${item.threadUrl}\n${head}\n---\n${body}\n${item.postAtText}`
                  })
                  .join('\n\n')}
              </pre>
            </Space>
          </Card>
        ) : null}
        {dcToday ? (
          <Card size="small" title={`懂车帝${scopeLabel}预览`}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">
                user_id {dcToday.userId || '—'} · {scopeLabel}更新 {dcToday.todayPosts.length} 条
              </Text>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {dcToday.todayPosts
                  .slice(0, 20)
                  .map((item, idx) => {
                    const head = item.title || '（无标题）'
                    const body = item.bodyText || head
                    return `${idx + 1}. ${item.articleUrl}\n${head}\n---\n${body}`
                  })
                  .join('\n\n')}
              </pre>
            </Space>
          </Card>
        ) : null}
        {yiToday ? (
          <Card size="small" title={`易车${scopeLabel}预览`}>
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Text type="secondary">
                user_id {yiToday.userId || '—'} · {scopeLabel}更新 {yiToday.todayPosts.length} 条
              </Text>
              <pre
                style={{
                  margin: 0,
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {yiToday.todayPosts
                  .slice(0, 20)
                  .map((item, idx) => {
                    const head = item.title || '（无标题）'
                    const body = item.bodyText || head
                    return `${idx + 1}. ${item.postUrl}\n${head}\n---\n${body}\n${item.postAtText}`
                  })
                  .join('\n\n')}
              </pre>
            </Space>
          </Card>
        ) : null}
      </Space>
    </div>
  )
}

function MappingFieldScroll(props: { children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', paddingBottom: 4 }}>{props.children}</div>
  )
}

function FieldSelect(props: {
  label: string
  options: SelectOption[]
  value: string | undefined
  onChange: (v: string | undefined) => void
}) {
  const { label, options, value, onChange } = props
  return (
    <div>
      <div style={{ marginBottom: 4, fontSize: 12 }}>{label}</div>
      <Select
        style={{ width: '100%' }}
        placeholder="不写回"
        options={options}
        value={value}
        onChange={onChange}
        allowClear
        showSearch
        optionFilterProp="label"
      />
    </div>
  )
}

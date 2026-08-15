/**
 * 授权入口 UI：挂在 shell.overlay 层的浮动卡片（layer 本身 click-through，
 * 卡片根元素自行恢复 pointer events； fixed 右下角小卡，无全屏遮罩）。
 *
 * 两种形态：
 *  - 展开：状态点 + 目录名 + 授权按钮组 + 「目录内容」懒加载树 + 「—」收起钮；
 *  - 收起：右下角 36px 圆钮（📁 + 状态点），点击展开。折叠状态由 apply 闭包
 *    持久化到 localStorage（本文件只读快照）。
 *
 * 目录树状态（展开集合/已加载层级）是组件内的 useState —— 纯 viewing state，
 * 不进共享快照；rootVersion 作 key，换目录/解除授权时整树重置。
 * @module dsh-browser-fs/client/ui
 */

import { useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { RosterExecutor } from '../wire.js'
import { listLevel, resolveDir } from './fs.js'

/** 卡片可见的全部状态（apply 闭包里的单一数据源）。 */
export interface BrowserFsState {
  /** 到 host 半的 WS 是否在线。 */
  wsConnected: boolean
  /** 当前目录句柄的 readwrite 权限状态；none 表示尚未选过目录。 */
  permission: 'none' | 'prompt' | 'granted' | 'denied'
  /** 已授权根目录名。 */
  dirName: string | null
  /** 授权交互进行中（系统选择器/权限弹窗开着）。 */
  busy: boolean
  /** 最近一次授权错误。 */
  error: string | null
  /** 卡片是否折叠成圆钮。 */
  collapsed: boolean
  /** 当前授权根句柄（未授权为 null）；引用仅用于目录树读取。 */
  root: FileSystemDirectoryHandle | null
  /** 句柄代际：每次换目录/解除授权 +1，作目录树的重置 key。 */
  rootVersion: number
  /** 生效中的设备标签（昵称 ?? UA 派生）。 */
  label: string
  /** 用户设置的昵称（null 表示用 UA 派生）。 */
  nickname: string | null
  /** host 广播的执行者名单（仅持有授权的设备；本机持柄时也含本机）。 */
  executors: RosterExecutor[]
}

/** 卡片动作（授权必须经过用户手势，全部挂按钮点击）。 */
export interface CardActions {
  /** 已有句柄时请求权限；无句柄时弹目录选择器。 */
  authorize(): void
  /** 弹目录选择器换一个新目录。 */
  pickNew(): void
  /** 清除持久化句柄，回到未授权状态。 */
  revoke(): void
  /** 收起成圆钮 / 展开回卡片。 */
  toggleCollapsed(): void
  /** 设置设备昵称（空串清除，回落 UA 派生）。 */
  setDeviceName(name: string): void
}

/** 卡片数据源：订阅 + 快照 + 动作。 */
export interface CardSource {
  subscribe(listener: () => void): () => void
  getSnapshot(): BrowserFsState
  readonly actions: CardActions
}

const cardStyle: CSSProperties = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: 1000,
  pointerEvents: 'auto',
  minWidth: '240px',
  maxWidth: '340px',
  padding: '10px 12px',
  borderRadius: '10px',
  background: 'rgba(32, 33, 36, 0.92)',
  color: '#e8eaed',
  fontSize: '12px',
  lineHeight: 1.5,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  fontFamily: 'system-ui, sans-serif',
}

const buttonStyle: CSSProperties = {
  border: '1px solid rgba(255, 255, 255, 0.25)',
  borderRadius: '6px',
  background: 'transparent',
  color: 'inherit',
  padding: '3px 10px',
  fontSize: '12px',
  cursor: 'pointer',
}

/** 收起后的圆钮。 */
const fabStyle: CSSProperties = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: 1000,
  pointerEvents: 'auto',
  width: '36px',
  height: '36px',
  borderRadius: '50%',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  background: 'rgba(32, 33, 36, 0.92)',
  color: '#e8eaed',
  fontSize: '16px',
  cursor: 'pointer',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
}

function statusColor(state: BrowserFsState): string {
  if (!state.wsConnected) return '#9aa0a6'
  if (state.permission === 'granted') return '#34a853'
  if (state.permission === 'none') return '#9aa0a6'
  return '#fbbc04'
}

function statusText(state: BrowserFsState): string {
  if (!state.wsConnected) return '未连接宿主（重连中）'
  switch (state.permission) {
    case 'granted': return `已授权：${state.dirName ?? ''}（本机：${state.label}）`
    case 'prompt': return '目录权限待确认'
    case 'denied': return '目录权限被拒绝'
    case 'none': {
      // 本机没授权但 roster 里有持柄设备：告诉用户授权落在哪台设备上。
      if (state.executors.length > 0) {
        const whom = state.executors
          .map(executor => `${executor.label}${executor.dirName === null ? '' : `（${executor.dirName}）`}`)
          .join('、')
        return `当前授权在设备：${whom}`
      }
      return '未授权目录'
    }
  }
}

/** 圆钮右上角的状态点（与卡片标题行同一配色语义）。 */
function StatusDot({ color }: { color: string }): ReactElement {
  return (
    <span style={{
      position: 'absolute', top: '-1px', right: '-1px',
      width: '9px', height: '9px', borderRadius: '50%',
      background: color, border: '1.5px solid rgba(32, 33, 36, 0.92)',
    }} />
  )
}

// ---------- 目录内容树 ----------

/** 每级条目上限。 */
const LEVEL_LIMIT = 200

interface TreeNode {
  name: string
  /** 相对授权根的路径。 */
  path: string
  kind: 'file' | 'directory'
  size?: number
}

interface LevelData {
  entries: TreeNode[]
  total: number
}

function humanSize(size: number): string {
  if (size < 1024) return `${String(size)} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const rowTextStyle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/**
 * 「目录内容」懒加载树：首次打开只读根级，点目录行展开读子级（每次展开经
 * resolveDir 从根重新取句柄，容忍 revoke 后的最新状态），再点收起并丢弃缓存。
 * @param props.root - 当前授权根句柄。
 */
function DirTree({ root }: { root: FileSystemDirectoryHandle }): ReactElement {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [levels, setLevels] = useState<ReadonlyMap<string, LevelData>>(new Map())
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [copied, setCopied] = useState<string | null>(null)

  const loadLevel = async (dirPath: string): Promise<void> => {
    setLoading(prev => new Set(prev).add(dirPath))
    try {
      const dir = await resolveDir(root, dirPath)
      const { entries, total } = await listLevel(dir, LEVEL_LIMIT)
      const nodes: TreeNode[] = entries.map(entry => ({
        ...entry,
        path: dirPath === '' ? entry.name : `${dirPath}/${entry.name}`,
      }))
      setLevels(prev => new Map(prev).set(dirPath, { entries: nodes, total }))
      setErrors(prev => {
        const next = new Map(prev)
        next.delete(dirPath)
        return next
      })
    } catch (error) {
      setErrors(prev => new Map(prev).set(dirPath, error instanceof Error ? error.message : String(error)))
    } finally {
      setLoading(prev => {
        const next = new Set(prev)
        next.delete(dirPath)
        return next
      })
    }
  }

  const toggleSection = (): void => {
    if (!open && !levels.has('') && !loading.has('')) void loadLevel('')
    setOpen(!open)
  }

  const toggleDir = (path: string): void => {
    if (expanded.has(path)) {
      setExpanded(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      // 缓存丢弃：下次展开重新取，保证看到的是最新内容。
      setLevels(prev => {
        const next = new Map(prev)
        next.delete(path)
        return next
      })
    } else {
      setExpanded(prev => new Set(prev).add(path))
      void loadLevel(path)
    }
  }

  const copyPath = (path: string): void => {
    void navigator.clipboard?.writeText(path).then(() => {
      setCopied(path)
      setTimeout(() => { setCopied(prev => (prev === path ? null : prev)) }, 1200)
    }).catch(() => {
      // 剪贴板被拒（权限/焦点）：静默，不打扰浏览动作。
    })
  }

  const renderLevel = (dirPath: string, depth: number): ReactElement[] => {
    const level = levels.get(dirPath)
    if (level === undefined) return []
    const rows: ReactElement[] = []
    for (const entry of level.entries) {
      rows.push(
        <div key={entry.path} style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          paddingLeft: `${String(depth * 12)}px`, paddingTop: '1px', paddingBottom: '1px',
        }}>
          {entry.kind === 'directory'
            ? (
              <span
                style={{ ...rowTextStyle, cursor: 'pointer', flex: 1 }}
                onClick={() => { toggleDir(entry.path) }}
                title={entry.path}
              >
                {expanded.has(entry.path) ? '▾' : '▸'} 📁 {entry.name}
              </span>
            )
            : (
              <>
                <span style={{ ...rowTextStyle, flex: 1 }} title={entry.path}>
                  📄 {entry.name}
                  {entry.size !== undefined && <span style={{ opacity: 0.55 }}> {humanSize(entry.size)}</span>}
                </span>
                <button
                  style={{ ...buttonStyle, padding: '0 5px', fontSize: '10px', flexShrink: 0 }}
                  title={`复制相对路径：${entry.path}`}
                  onClick={() => { copyPath(entry.path) }}
                >
                  {copied === entry.path ? '✓' : '复制路径'}
                </button>
              </>
            )}
        </div>,
      )
      if (entry.kind === 'directory' && expanded.has(entry.path)) {
        if (loading.has(entry.path) && !levels.has(entry.path)) {
          rows.push(
            <div key={`${entry.path}~loading`} style={{ paddingLeft: `${String((depth + 1) * 12)}px`, opacity: 0.6 }}>
              加载中…
            </div>,
          )
        }
        const error = errors.get(entry.path)
        if (error !== undefined) {
          rows.push(
            <div key={`${entry.path}~error`} style={{ paddingLeft: `${String((depth + 1) * 12)}px`, color: '#f28b82' }}>
              {error}
            </div>,
          )
        }
        rows.push(...renderLevel(entry.path, depth + 1))
      }
    }
    const rest = level.total - level.entries.length
    if (rest > 0) {
      rows.push(
        <div key={`${dirPath}~more`} style={{ paddingLeft: `${String(depth * 12)}px`, opacity: 0.6 }}>
          …还有 {rest} 项
        </div>,
      )
    }
    return rows
  }

  return (
    <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '6px' }}>
      <div style={{ cursor: 'pointer', userSelect: 'none' }} onClick={toggleSection}>
        {open ? '▾' : '▸'} 目录内容
      </div>
      {open && (
        <div style={{ maxHeight: '240px', overflowY: 'auto', marginTop: '4px' }}>
          {loading.has('') && !levels.has('') && <div style={{ opacity: 0.6 }}>加载中…</div>}
          {errors.has('') && <div style={{ color: '#f28b82' }}>{errors.get('')}</div>}
          {renderLevel('', 0)}
        </div>
      )}
    </div>
  )
}

/**
 * 创建卡片组件（闭包捕获数据源；组件本体无订阅机器，只读快照）。
 * @param source - 状态源与动作。
 * @returns 可注册进 shell.overlay 的函数组件。
 */
export function createCard(source: CardSource): () => ReactElement {
  return function BrowserFsCard(): ReactElement {
    const state = useSyncExternalStore(source.subscribe, source.getSnapshot)
    const { actions } = source
    const [editingName, setEditingName] = useState(false)
    const [draftName, setDraftName] = useState('')

    if (state.collapsed) {
      return (
        <button style={fabStyle} onClick={() => { actions.toggleCollapsed() }} title="browser-fs 浏览器文件">
          📁
          <StatusDot color={statusColor(state)} />
        </button>
      )
    }

    const saveName = (): void => {
      actions.setDeviceName(draftName)
      setEditingName(false)
    }

    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: statusColor(state), flexShrink: 0,
          }} />
          <strong style={{ flex: 1 }}>browser-fs 浏览器文件</strong>
          <button
            style={{ ...buttonStyle, padding: '0 7px', lineHeight: 1.2 }}
            onClick={() => { actions.toggleCollapsed() }}
            title="收起"
          >
            —
          </button>
        </div>
        <div style={{ marginBottom: '4px', opacity: 0.9 }}>{statusText(state)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px', opacity: 0.85 }}>
          {editingName
            ? (
              <>
                <input
                  autoFocus
                  value={draftName}
                  placeholder="留空用 UA 派生标签"
                  style={{
                    flex: 1, minWidth: 0, background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px',
                    color: 'inherit', fontSize: '12px', padding: '2px 6px',
                  }}
                  onChange={event => { setDraftName(event.target.value) }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') saveName()
                    if (event.key === 'Escape') setEditingName(false)
                  }}
                  onBlur={saveName}
                />
              </>
            )
            : (
              <>
                <span style={{ ...rowTextStyle, flex: 1 }} title={state.label}>本机：{state.label}</span>
                <button
                  style={{ ...buttonStyle, padding: '0 5px', fontSize: '10px', flexShrink: 0 }}
                  title="编辑设备昵称"
                  onClick={() => {
                    setDraftName(state.nickname ?? '')
                    setEditingName(true)
                  }}
                >
                  ✏️
                </button>
              </>
            )}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {state.permission === 'granted'
            ? (
              <>
                <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickNew() }}>更换目录</button>
                <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.revoke() }}>解除授权</button>
              </>
            )
            : (
              <>
                <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.authorize() }}>
                  {state.permission === 'none' ? '授权目录' : '重新授权'}
                </button>
                {state.permission !== 'none' && (
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickNew() }}>更换目录</button>
                )}
              </>
            )}
        </div>
        {state.permission === 'granted' && state.root !== null && (
          <DirTree key={state.rootVersion} root={state.root} />
        )}
        {state.error !== null && (
          <div style={{ marginTop: '6px', color: '#f28b82' }}>{state.error}</div>
        )}
        {state.error !== null && window.self !== window.top && (
          <div style={{ marginTop: '6px' }}>
            <a href={location.origin} target="_blank" rel="noreferrer" style={{ color: '#8ab4f8' }}>
              ↗ 在独立标签页打开本页完成授权
            </a>
          </div>
        )}
      </div>
    )
  }
}

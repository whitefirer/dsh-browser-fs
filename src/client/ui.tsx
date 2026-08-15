/**
 * 授权入口 UI：挂在 shell.overlay 层的浮动卡片（layer 本身 click-through，
 * 卡片根元素自行恢复 pointer events；默认 fixed 右下角小卡，标题行可作
 * 拖拽把手自由定位，位置存 localStorage 并在拖动结束/窗口 resize 时
 * clamp 进视口）。
 *
 * 两种形态：
 *  - 展开：状态点 + 目录名 + 授权按钮组 + 「目录内容」懒加载树 + 「—」收起钮；
 *  - 收起：右下角 36px 圆钮（📁 + 状态点），点击展开。折叠状态由 apply 闭包
 *    持久化到 localStorage（本文件只读快照）。
 *
 * 目录树状态（展开集合/已加载层级）是组件内的 useState —— 纯 viewing state，
 * 不进共享快照；rootVersion 作 key，换目录/解除授权时整树重置。文件名可点击
 * 弹出预览层（FilePreview：图片走 blob URL，文本取前 64KB，已映射语言经
 * 懒加载高亮 chunk 做语法着色）；授权行的「↻」刷新按钮经 apiRef 调 DirTree
 * 的清缓存重拉（兼容模式改为重开选择器）。
 * @module dsh-browser-fs/client/ui
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { DEFAULT_HIGHLIGHT_PATH, type RosterExecutor } from '../wire.js'
import type { FsBackend } from './fs.js'
import {
  MAX_IMAGE_PREVIEW_BYTES,
  TEXT_PREVIEW_BYTES,
  imageMimeFor,
  langFor,
  looksBinary,
  previewKindFor,
} from './preview.js'

/** 卡片可见的全部状态（apply 闭包里的单一数据源）。 */
export interface BrowserFsState {
  /** 到 host 半的 WS 是否在线。 */
  wsConnected: boolean
  /** 当前目录句柄的 readwrite 权限状态；none 表示尚未选过目录。 */
  permission: 'none' | 'prompt' | 'granted' | 'denied'
  /** 已授权根目录名（兼容模式为所选目录/「N 个文件」）。 */
  dirName: string | null
  /** 授权交互进行中（系统选择器/权限弹窗开着）。 */
  busy: boolean
  /** 最近一次授权错误。 */
  error: string | null
  /** 卡片是否折叠成圆钮。 */
  collapsed: boolean
  /** 当前文件后端（完整模式句柄 / 兼容模式 File 映射；未授权为 null）。 */
  backend: FsBackend | null
  /** 后端代际：每次换目录/解除授权 +1，作目录树的重置 key。 */
  rootVersion: number
  /** 生效中的设备标签（昵称 ?? UA 派生）。 */
  label: string
  /** 用户设置的昵称（null 表示用 UA 派生）。 */
  nickname: string | null
  /** host 广播的执行者名单（仅持有授权的设备；本机持柄时也含本机）。 */
  executors: RosterExecutor[]
  /** showDirectoryPicker 是否可用（特性检测结果；false 即兼容模式语境）。 */
  pickerAvailable: boolean
  /** 当前是否处于兼容模式（File 映射、只读、无持久化）。 */
  compat: boolean
}

/** 卡片动作（授权必须经过用户手势，全部挂按钮点击）。 */
export interface CardActions {
  /** 完整模式：请求权限/弹目录选择器；兼容模式：弹 input 选目录。 */
  authorize(): void
  /** 换一个新目录（两模式各自的选择器）。 */
  pickNew(): void
  /** 清除授权/兼容选择，回到未授权状态。 */
  revoke(): void
  /** 收起成圆钮 / 展开回卡片。 */
  toggleCollapsed(): void
  /** 设置设备昵称（空串清除，回落 UA 派生）。 */
  setDeviceName(name: string): void
  /** 兼容模式：选目录（webkitdirectory；有失效前科时自动退多选）。 */
  pickCompatDir(): void
  /** 兼容模式：多选文件（multiple）。 */
  pickCompatFiles(): void
  /** 兼容模式 ↻ 刷新：按上次成功选择的形态重开选择器。 */
  pickCompatRefresh(): void
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
    case 'granted': return state.compat
      ? `已选择：${state.dirName ?? ''}（本机：${state.label}；兼容模式只读，刷新后需重选）`
      : `已授权：${state.dirName ?? ''}（本机：${state.label}）`
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

// ---------- 文件预览层 ----------

/** 预览内容状态机（加载中/各类结果/错误）。 */
type PreviewResult =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'too-big'; size: number }
  | { status: 'binary'; size: number }
  | { status: 'image'; url: string; size: number }
  /** highlighting=true：语言已映射，高亮 chunk 加载中（先出纯文本，到位后换 code）。 */
  | { status: 'text'; text: string; size: number; truncated: boolean; highlighting?: boolean }
  | { status: 'code'; html: string; size: number; truncated: boolean }

/** 高亮 chunk（lib/highlight.mjs）的导出契约。 */
interface HighlightModule {
  highlightCode(code: string, lang: string): string
}

/**
 * 按需加载语法高亮 chunk：模块级缓存 import Promise，只拉一次；失败也缓存
 * （路由缺失是持续状态，后续预览直接退回纯文本，不反复打请求）。
 * 绝对路径 specifier esbuild 在 cjs 产物里同样原样保留 import()（已实测）。
 */
let highlightModulePromise: Promise<HighlightModule> | null = null
function loadHighlighter(): Promise<HighlightModule> {
  highlightModulePromise ??= import(DEFAULT_HIGHLIGHT_PATH) as Promise<HighlightModule>
  return highlightModulePromise
}

const previewMaskStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1100,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const previewCardStyle: CSSProperties = {
  maxWidth: 'min(720px, 90vw)',
  maxHeight: '80vh',
  overflow: 'auto',
  padding: '10px 12px',
  borderRadius: '10px',
  background: 'rgba(32, 33, 36, 0.98)',
  color: '#e8eaed',
  fontSize: '12px',
  lineHeight: 1.5,
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
  fontFamily: 'system-ui, sans-serif',
}

/**
 * 文件预览层：遮罩 + 卡片。图片（按扩展名）读 arrayBuffer 建 blob URL 用
 * <img> 展示（>8MB 不拉取，直接提示太大）；其余按文本只取前 64KB UTF-8
 * 解码，等宽 <pre> 展示并标注截断；解码后含 NUL 视为二进制。文本经
 * langFor 映射到语言时再做语法着色（高亮 chunk 按需加载，loading 态先出
 * 纯文本，失败退回纯文本）。
 * ✕ / 点遮罩 / ESC 关闭，关闭（卸载）时 revokeObjectURL。
 * @param props.backend - 当前文件后端（两模式同路径，readBlob 各自实现）。
 * @param props.path - 相对授权根的文件路径。
 * @param props.onClose - 关闭回调。
 */
function FilePreview({ backend, path, onClose }: { backend: FsBackend; path: string; onClose(): void }): ReactElement {
  const [result, setResult] = useState<PreviewResult>({ status: 'loading' })
  const name = path.split('/').pop() ?? path

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    void (async () => {
      try {
        const blob = await backend.readBlob(path)
        if (previewKindFor(path) === 'image') {
          if (blob.size > MAX_IMAGE_PREVIEW_BYTES) {
            if (!cancelled) setResult({ status: 'too-big', size: blob.size })
            return
          }
          const buffer = await blob.arrayBuffer()
          objectUrl = URL.createObjectURL(new Blob([buffer], { type: imageMimeFor(path) }))
          if (!cancelled) setResult({ status: 'image', url: objectUrl, size: blob.size })
        } else {
          const truncated = blob.size > TEXT_PREVIEW_BYTES
          const text = await (truncated ? blob.slice(0, TEXT_PREVIEW_BYTES) : blob).text()
          if (cancelled) return
          if (looksBinary(text)) {
            setResult({ status: 'binary', size: blob.size })
            return
          }
          const lang = langFor(path)
          if (lang === null) {
            setResult({ status: 'text', text, size: blob.size, truncated })
            return
          }
          // 已映射语言：先出纯文本（标注着色加载中），chunk 到位后对截断文本
          // 着色并换成 code 态；加载/着色失败静默退回纯文本。
          setResult({ status: 'text', text, size: blob.size, truncated, highlighting: true })
          try {
            const mod = await loadHighlighter()
            const html = mod.highlightCode(text, lang)
            if (!cancelled) setResult({ status: 'code', html, size: blob.size, truncated })
          } catch {
            if (!cancelled) setResult({ status: 'text', text, size: blob.size, truncated })
          }
        }
      } catch (error) {
        if (!cancelled) {
          setResult({ status: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [backend, path])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  return (
    <div style={previewMaskStyle} onClick={onClose}>
      <div style={previewCardStyle} onClick={(event) => { event.stopPropagation() }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <strong style={{ ...rowTextStyle, flex: 1 }} title={path}>📄 {name}</strong>
          <button
            style={{ ...buttonStyle, padding: '0 7px', lineHeight: 1.2 }}
            onClick={onClose}
            title="关闭（Esc）"
          >
            ✕
          </button>
        </div>
        <div style={{ ...rowTextStyle, opacity: 0.6, fontFamily: 'monospace', fontSize: '11px' }} title={path}>
          {path}
        </div>
        <div style={{ marginTop: '8px' }}>
          {result.status === 'loading' && <span style={{ opacity: 0.6 }}>加载中…</span>}
          {result.status === 'error' && <span style={{ color: '#f28b82' }}>{result.message}</span>}
          {result.status === 'too-big' && (
            <span style={{ opacity: 0.85 }}>图片太大（{humanSize(result.size)}），超过 8MB 不预览</span>
          )}
          {result.status === 'binary' && (
            <span style={{ opacity: 0.85 }}>二进制文件不支持预览（{humanSize(result.size)}）</span>
          )}
          {result.status === 'image' && (
            <img src={result.url} alt={name} style={{ maxWidth: '100%', borderRadius: '6px' }} />
          )}
          {result.status === 'text' && (
            <>
              {result.truncated && (
                <div style={{ opacity: 0.6, marginBottom: '4px' }}>
                  仅前 64KB（文件共 {humanSize(result.size)}）
                </div>
              )}
              {result.highlighting === true && (
                <div style={{ opacity: 0.6, marginBottom: '4px' }}>语法着色加载中…</div>
              )}
              <pre style={{
                margin: 0, fontFamily: 'monospace', fontSize: '11px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {result.text}
              </pre>
            </>
          )}
          {result.status === 'code' && (
            <>
              {result.truncated && (
                <div style={{ opacity: 0.6, marginBottom: '4px' }}>
                  仅前 64KB（文件共 {humanSize(result.size)}）
                </div>
              )}
              {/* hljs 输出已转义（& < >），可安全注入。 */}
              <pre
                className="hljs"
                style={{
                  margin: 0, fontFamily: 'monospace', fontSize: '11px',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}
              >
                <code dangerouslySetInnerHTML={{ __html: result.html }} />
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** DirTree 暴露给卡片授权行的刷新入口（清缓存 + 重拉根级）。 */
export interface DirTreeApi {
  refresh(): void
}

/**
 * 「目录内容」懒加载树：首次打开只读根级，点目录行展开读子级（每次展开经
 * 后端重新取该级，容忍 revoke 后的最新状态），再点收起并丢弃缓存。
 * 兼容模式与完整模式同路径（后端各自实现 listLevel）。文件名可点击弹出
 * 预览层；refresh()（授权行「↻」按钮经 apiRef 调用）清空全部层级/展开
 * 缓存并重拉根级（树区未展开时只清缓存，下次打开再拉）。
 * @param props.backend - 当前文件后端。
 * @param props.apiRef - 输出 DirTreeApi 的引用（createCard 闭包持有）。
 */
function DirTree({ backend, apiRef }: { backend: FsBackend; apiRef: { current: DirTreeApi | null } }): ReactElement {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [levels, setLevels] = useState<ReadonlyMap<string, LevelData>>(new Map())
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [copied, setCopied] = useState<string | null>(null)
  /** 预览中的文件相对路径（null 为无预览层）。 */
  const [preview, setPreview] = useState<string | null>(null)

  /** 清全部层级/展开缓存并重拉根级（树区收起时只清缓存，下次展开再拉）。 */
  const refresh = (): void => {
    setExpanded(new Set())
    setLevels(new Map())
    setErrors(new Map())
    setCopied(null)
    if (open) void loadLevel('')
  }

  // 每次渲染重挂 api（refresh 闭包随 open 变化）；卸载时清空。
  useEffect(() => {
    apiRef.current = { refresh }
    return () => { apiRef.current = null }
  })

  const loadLevel = async (dirPath: string): Promise<void> => {
    setLoading(prev => new Set(prev).add(dirPath))
    try {
      const { entries, total } = await backend.listLevel(dirPath, LEVEL_LIMIT)
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
                <span
                  style={{ ...rowTextStyle, flex: 1, cursor: 'pointer', color: '#8ab4f8' }}
                  title={`点击预览：${entry.path}`}
                  onClick={() => { setPreview(entry.path) }}
                >
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
      {preview !== null && (
        <FilePreview backend={backend} path={preview} onClose={() => { setPreview(null) }} />
      )}
    </div>
  )
}

// ---------- 卡片拖拽换位 ----------

/** 卡片自由定位（fixed 的 left/top）；state 里 null 表示默认右下角（right/bottom 16px）。 */
interface CardPos {
  left: number
  top: number
}

/** 卡片位置的 localStorage key（与 device-name/collapsed 同前缀约定）。 */
const CARD_POS_KEY = 'dsh-browser-fs:card-pos'

/** 拖动结束/窗口 resize 后视口内至少保留可见的像素数。 */
const CARD_MIN_VISIBLE = 48

/** 位移超过该像素才算拖拽；低于此按点击处理（不吃折叠/昵称/授权按钮的点击）。 */
const DRAG_THRESHOLD_PX = 4

/** 读本地记忆的卡片位置；缺失/畸形/localStorage 不可用一律回 null（默认位）。 */
function readStoredCardPos(): CardPos | null {
  try {
    const raw = localStorage.getItem(CARD_POS_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { left, top } = parsed as { left?: unknown; top?: unknown }
    if (typeof left !== 'number' || typeof top !== 'number') return null
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null
    return { left, top }
  } catch {
    return null
  }
}

/**
 * 把卡片位置 clamp 进视口：左右方向至少露 48px，上方不许出屏（标题行是
 * 唯一把手，必须够得着），下方最多沉到只露 48px。
 * @param pos - 待校正位置。
 * @param size - 卡片当前实际尺寸。
 */
function clampCardPos(pos: CardPos, size: { width: number; height: number }): CardPos {
  return {
    left: Math.min(Math.max(pos.left, CARD_MIN_VISIBLE - size.width), window.innerWidth - CARD_MIN_VISIBLE),
    top: Math.min(Math.max(pos.top, 0), window.innerHeight - CARD_MIN_VISIBLE),
  }
}

/**
 * 创建卡片组件（闭包捕获数据源；组件本体无订阅机器，只读快照）。
 * @param source - 状态源与动作。
 * @returns 可注册进 shell.overlay 的函数组件。
 */
export function createCard(source: CardSource): () => ReactElement {
  /** DirTree 的清缓存重拉入口（组件挂载时填入，卸载清空）。 */
  const treeApi: { current: DirTreeApi | null } = { current: null }
  return function BrowserFsCard(): ReactElement {
    const state = useSyncExternalStore(source.subscribe, source.getSnapshot)
    const { actions } = source
    const [editingName, setEditingName] = useState(false)
    const [draftName, setDraftName] = useState('')
    /** 自由定位（null = 默认右下角）；初值取本地记忆。 */
    const [pos, setPos] = useState<CardPos | null>(readStoredCardPos)
    const cardRef = useRef<HTMLDivElement | null>(null)
    const dragRef = useRef<{
      pointerId: number
      startX: number
      startY: number
      baseLeft: number
      baseTop: number
      moved: boolean
    } | null>(null)
    /** 真拖拽后要吞掉紧随的 click（如按在「—」上起拖，松手不该触发折叠）。 */
    const suppressClickRef = useRef(false)

    /** 按卡片当前实际尺寸 clamp（ref 未挂载时按零尺寸兜底）。 */
    const clampToViewport = (p: CardPos): CardPos => {
      const card = cardRef.current
      return clampCardPos(p, { width: card?.offsetWidth ?? 0, height: card?.offsetHeight ?? 0 })
    }

    // 恢复的位置可能已出视口（窗口此后变小过）：挂载后 clamp 一次；窗口
    // resize 时同样 clamp。校正结果不落盘——存储的仍是用户拖放的点。
    useEffect(() => {
      const clampIntoView = (): void => { setPos(prev => (prev === null ? prev : clampToViewport(prev))) }
      clampIntoView()
      window.addEventListener('resize', clampIntoView)
      return () => { window.removeEventListener('resize', clampIntoView) }
      // clampToViewport 只读 ref，无需进依赖。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // 标题行拖拽把手：pointer events 一统鼠标/触摸；capture 保证移出把手仍跟随。
    const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const card = cardRef.current
      if (card === null) return
      const rect = card.getBoundingClientRect()
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: rect.left,
        baseTop: rect.top,
        moved: false,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    const onHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current
      if (drag === null || event.pointerId !== drag.pointerId) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (!drag.moved) {
        // 阈值内不动卡片：保住把手上按钮/圆点的点击语义。
        if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return
        drag.moved = true
      }
      setPos({ left: drag.baseLeft + dx, top: drag.baseTop + dy })
    }

    const endDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current
      if (drag === null || event.pointerId !== drag.pointerId) return
      dragRef.current = null
      if (!drag.moved) return
      suppressClickRef.current = true
      setPos(prev => {
        const clamped = clampToViewport(prev ?? { left: drag.baseLeft, top: drag.baseTop })
        try {
          localStorage.setItem(CARD_POS_KEY, JSON.stringify(clamped))
        } catch {
          // localStorage 不可用：位置只在本次页面存活。
        }
        return clamped
      })
    }

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

    /** 有自由定位时改用 left/top 定位；否则保持默认右下角。 */
    const appliedCardStyle: CSSProperties = pos === null
      ? cardStyle
      : { ...cardStyle, right: 'auto', bottom: 'auto', left: `${String(pos.left)}px`, top: `${String(pos.top)}px` }

    return (
      <div
        ref={cardRef}
        style={appliedCardStyle}
        onClickCapture={(event) => {
          // 真拖拽后的 click 一律吞掉（防止拖到按钮上松手触发按钮动作）。
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            event.stopPropagation()
            event.preventDefault()
          }
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px',
            cursor: 'grab', touchAction: 'none', userSelect: 'none',
          }}
          title="拖拽移动卡片"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
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
            ? state.compat
              ? (
                <>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickCompatDir() }}>重选目录</button>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickCompatFiles() }}>选文件</button>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.revoke() }}>清除</button>
                  {/* 兼容模式缓存即选择时快照，刷新 = 按上次形态重开选择器。 */}
                  <button
                    style={buttonStyle}
                    disabled={state.busy}
                    title="刷新目录（重新选择）"
                    onClick={() => { actions.pickCompatRefresh() }}
                  >
                    ↻
                  </button>
                </>
              )
              : (
                <>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickNew() }}>更换目录</button>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.revoke() }}>解除授权</button>
                  <button style={buttonStyle} title="刷新目录" onClick={() => { treeApi.current?.refresh() }}>↻</button>
                </>
              )
            : state.pickerAvailable
              ? (
                <>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.authorize() }}>
                    {state.permission === 'none' ? '授权目录' : '重新授权'}
                  </button>
                  {state.permission !== 'none' && (
                    <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickNew() }}>更换目录</button>
                  )}
                </>
              )
              : (
                <>
                  {/* 兼容模式授权区双入口：目录 / 多选文件，不再只靠属性探测自动二选一。 */}
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickCompatDir() }}>选择目录</button>
                  <button style={buttonStyle} disabled={state.busy} onClick={() => { actions.pickCompatFiles() }}>选多个文件</button>
                </>
              )}
        </div>
        {!state.pickerAvailable && (
          <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '6px', opacity: 0.85 }}>
            <span style={{
              display: 'inline-block', padding: '0 6px', borderRadius: '4px',
              background: 'rgba(251, 188, 4, 0.25)', color: '#fbbc04',
              fontSize: '10px', marginBottom: '4px',
            }}>
              兼容模式
            </span>
            <div>
              当前页面非安全上下文，File System Access API 不可用：只能只读浏览，刷新后需重选。
            </div>
            <div style={{ marginTop: '4px' }}>
              获得完整模式（可写 + 持久授权）：
              <div style={{ marginTop: '2px', fontFamily: 'monospace', fontSize: '11px', opacity: 0.9 }}>
                ① SSH 转发：ssh -L 9101:127.0.0.1:9101 用户@主机
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', opacity: 0.9 }}>
                ② Chrome：chrome://flags/#unsafely-treat-insecure-origin-as-secure
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', opacity: 0.9 }}>
                ③ 改用 HTTPS 访问
              </div>
            </div>
          </div>
        )}
        {state.permission === 'granted' && state.backend !== null && (
          <DirTree key={state.rootVersion} backend={state.backend} apiRef={treeApi} />
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

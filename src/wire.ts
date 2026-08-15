/**
 * dsh-browser-fs 的私有 wire 协议：host 半（Node）与 client 半（浏览器）之间
 * 经自建 WebSocket 通道传递的帧。两侧各自 bundle 本模块（type/常量层，
 * 无共享运行时身份）。
 *
 * 帧向：
 *   host → browser:  CallFrame   一次工具调用（list/read/write）
 *                    CancelFrame 调用方取消（exec.signal aborted）
 *   browser → host:  ResultFrame 一次调用的结果
 *                    StateFrame  上线/授权状态广播（host 据此挑选执行者）
 * @module dsh-browser-fs/wire
 */

/** WS 通道的默认精确 pathname（host 半 config.wsPath 可覆盖；client 半固定用默认值）。 */
export const DEFAULT_WS_PATH = '/browser-fs/ws'

/**
 * 语法高亮模块（懒加载 ESM chunk）的 HTTP pathname：与 WS 通道同目录下的
 * highlight.mjs。host 半按生效的 wsPath 派生并注册静态路由；client 半固定用
 * DEFAULT_WS_PATH 派生（与 WS 同一约定：改 wsPath 时两侧需同步）。
 * @param wsPath - 生效的 WS 通道路径。
 */
export function highlightModulePath(wsPath: string): string {
  const slash = wsPath.lastIndexOf('/')
  return `${slash <= 0 ? '' : wsPath.slice(0, slash)}/highlight.mjs`
}

/** client 半固定使用的高亮模块路径（由 DEFAULT_WS_PATH 派生）。 */
export const DEFAULT_HIGHLIGHT_PATH = highlightModulePath(DEFAULT_WS_PATH)

/** 浏览器端可执行的文件操作。 */
export type FsOp = 'list' | 'read' | 'write'

/** host → browser：一次工具调用。 */
export interface CallFrame {
  readonly type: 'call'
  readonly rpcId: string
  readonly op: FsOp
  readonly args: Record<string, unknown>
}

/** host → browser：取消进行中的调用。 */
export interface CancelFrame {
  readonly type: 'cancel'
  readonly rpcId: string
}

/** roster 里的一台执行者设备（hasHandle=true 的连接）。 */
export interface RosterExecutor {
  /** 设备标签（昵称优先，其次 UA 派生）。 */
  readonly label: string
  /** 该设备已授权的目录名。 */
  readonly dirName: string | null
}

/** host → browser：执行者名单广播（任一连接 state 变化/断连/新连接时全量推送）。 */
export interface RosterFrame {
  readonly type: 'roster'
  readonly executors: readonly RosterExecutor[]
}

export type HostFrame = CallFrame | CancelFrame | RosterFrame

/** browser → host：一次调用的完结。 */
export interface ResultFrame {
  readonly type: 'result'
  readonly rpcId: string
  readonly ok: boolean
  /** ok=true 时的操作结果（JSON 值）。 */
  readonly value?: unknown
  /** ok=false 时的错误消息。 */
  readonly error?: string
}

/** browser → host：连接/授权状态广播。只有 hasHandle=true 的标签页会被选为执行者。 */
export interface StateFrame {
  readonly type: 'state'
  readonly hasHandle: boolean
  /** 已授权根目录的显示名（未授权为 null）。 */
  readonly dirName: string | null
  /** 设备标签（昵称 > UA 派生；缺省为空串，host 侧兜底「未命名设备」）。 */
  readonly label: string
}

export type BrowserFrame = ResultFrame | StateFrame

const OPS: ReadonlySet<string> = new Set(['list', 'read', 'write'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 解析一条浏览器发来的原始文本帧；非法帧返回 null（wire 边界，宽松丢弃）。
 * @param raw - WebSocket message 的文本内容。
 * @returns 校验后的帧，或 null。
 */
export function parseBrowserFrame(raw: string): BrowserFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (value.type === 'result' && typeof value.rpcId === 'string' && typeof value.ok === 'boolean') {
    return {
      type: 'result',
      rpcId: value.rpcId,
      ok: value.ok,
      ...(value.value !== undefined ? { value: value.value } : {}),
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
    }
  }
  if (value.type === 'state' && typeof value.hasHandle === 'boolean') {
    return {
      type: 'state',
      hasHandle: value.hasHandle,
      dirName: typeof value.dirName === 'string' ? value.dirName : null,
      label: typeof value.label === 'string' ? value.label : '',
    }
  }
  return null
}

/**
 * 解析一条 host 发来的原始文本帧；非法帧返回 null（wire 边界，宽松丢弃）。
 * @param raw - WebSocket message 的文本内容。
 * @returns 校验后的帧，或 null。
 */
export function parseHostFrame(raw: string): HostFrame | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (value.type === 'call'
    && typeof value.rpcId === 'string'
    && typeof value.op === 'string'
    && OPS.has(value.op)
    && isRecord(value.args)) {
    return { type: 'call', rpcId: value.rpcId, op: value.op as FsOp, args: value.args }
  }
  if (value.type === 'cancel' && typeof value.rpcId === 'string') {
    return { type: 'cancel', rpcId: value.rpcId }
  }
  if (value.type === 'roster' && Array.isArray(value.executors)) {
    const executors: RosterExecutor[] = []
    for (const entry of value.executors as unknown[]) {
      if (!isRecord(entry) || typeof entry.label !== 'string') return null
      executors.push({
        label: entry.label,
        dirName: typeof entry.dirName === 'string' ? entry.dirName : null,
      })
    }
    return { type: 'roster', executors }
  }
  return null
}

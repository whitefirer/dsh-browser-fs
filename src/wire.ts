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

export type HostFrame = CallFrame | CancelFrame

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
  return null
}

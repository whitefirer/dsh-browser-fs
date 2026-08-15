/**
 * dsh-browser-fs host 半（跑在 dsh 宿主的 Node 进程里）：
 *
 *  - 在 ctx.webServer 上注册一条精确 pathname 的 upgrade 路由（默认
 *    /browser-fs/ws），自建 WebSocket 通道通向浏览器标签页；
 *  - 在 ctx.tools 上注册 browser_fs_list / browser_fs_read / browser_fs_write
 *    三个模型工具，execute 把调用帧发给"持有授权句柄"的标签页并等待结果帧；
 *  - 多个标签在线时只挑声明了 hasHandle 的连接（wire 协议选执行者）；
 *    无连接 / 无授权时 execute 立即抛出明确错误（registry 转成错误结果）。
 *
 * 升级请求不过 /api 信任栅栏，handler 里自做同源校验：Host 必须存在，
 * Origin 存在时其 authority 必须等于 Host（缺 Origin 放行，非浏览器客户端）。
 * @module dsh-browser-fs
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import WebSocket, { WebSocketServer } from 'ws'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ContentBlock, ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  DEFAULT_WS_PATH,
  highlightModulePath,
  parseBrowserFrame,
  type CallFrame,
  type FsOp,
} from './wire.js'

/** cordis 函数插件名。 */
export const name = 'browser-fs'

/** 宿主侧必需服务：WS 路由 + 工具注册表。 */
export const inject = ['webServer', 'tools']

/** 插件配置（cordis.patch.yml 行内 config，未提供 schema 时原样透传）。 */
export interface Config {
  /** WS 通道的精确 pathname；默认 /browser-fs/ws。 */
  wsPath?: string
  /** 一次浏览器调用的超时毫秒数；默认 120000。 */
  requestTimeoutMs?: number
}

/** apply 实际读到的宿主侧 ctx 面（结构声明；cordis 注入的真实 ctx 兼容它）。 */
interface HostContext {
  effect(fn: () => void | (() => void) | (() => Promise<void>), label?: string): void
  webServer: {
    register(route: {
      kind: 'exact' | 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
    registerUpgrade(route: {
      path: string
      handler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void | Promise<void>
    }): () => void
  }
  tools: {
    register(definition: ToolDefinition): () => void
  }
}

/** 一条浏览器 WS 连接（一个标签页）。 */
interface Conn {
  readonly id: string
  readonly ws: WebSocket
  /** 该标签页当前是否持有已授权的目录句柄（state 帧驱动）。 */
  hasHandle: boolean
  /** 已授权根目录显示名。 */
  dirName: string | null
  /** 设备标签（state 帧携带；空串表示对端尚未上报）。 */
  label: string
}

/** 一次等待浏览器回包的调用。 */
interface Pending {
  readonly conn: Conn
  readonly signal: AbortSignal
  readonly onAbort: () => void
  readonly resolve: (value: unknown) => void
  readonly reject: (error: Error) => void
  readonly timer: NodeJS.Timeout
}

/** 一次调用的完整回包：浏览器端 JSON 值 + 执行者设备标签。 */
interface CallOutcome {
  readonly value: unknown
  readonly device: string
}

/**
 * 同源校验：Host 头必须存在；Origin 存在时 authority 必须等于 Host
 * （缺 Origin 放行 —— 非浏览器客户端不发 Origin）。
 * @param req - HTTP upgrade 请求。
 * @returns 是否放行。
 */
function isSameOrigin(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (typeof host !== 'string' || host.length === 0) return false
  const origin = req.headers.origin
  if (typeof origin !== 'string') return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/** 拒绝一条不受信的 upgrade：协议协商前直接回 403 并关 socket。 */
function rejectWebSocketUpgrade(socket: Duplex): void {
  socket.end([
    'HTTP/1.1 403 Forbidden',
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Length: 9',
    '',
    'forbidden',
  ].join('\r\n'))
}

/**
 * 浏览器连接登记处 + 调用中继。持有全部在线标签页，按 state 帧挑选
 * 执行者，把 call 帧与 result 帧按 rpcId 配对，处理超时与取消。
 */
class BrowserRelay {
  private readonly server = new WebSocketServer({ noServer: true })
  private readonly conns = new Set<Conn>()
  private readonly pending = new Map<string, Pending>()

  /**
   * @param requestTimeoutMs - 单次调用的超时预算。
   */
  constructor(private readonly requestTimeoutMs: number) {}

  /**
   * 升级一条 socket 并登记标签页连接。
   * @param req - HTTP upgrade 请求（已过同源栅栏）。
   * @param socket - HTTP 服务器移交的裸 socket。
   * @param head - upgrade 头之后已读的字节。
   */
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.server.handleUpgrade(req, socket, head, (ws) => { this.accept(ws) })
  }

  /**
   * 挑选一个持有授权句柄的标签页，发起一次调用并等待结果。
   * @param op - 文件操作。
   * @param args - 操作参数。
   * @param signal - 调用方（工具 registry）的取消信号。
   * @returns 浏览器端回传的 JSON 值 + 执行者设备标签。
   */
  call(op: FsOp, args: Record<string, unknown>, signal: AbortSignal): Promise<CallOutcome> {
    const conn = this.pickExecutor()
    if (conn === undefined) {
      if (this.conns.size === 0) {
        return Promise.reject(new Error(
          'browser-fs: dsh 页面未在任何设备打开（这些工具操作的是浏览器所在机器的本地文件，需要一个在线标签页）',
        ))
      }
      return Promise.reject(new Error(
        'browser-fs: 没有设备持有授权目录（请在 dsh 页面的 browser-fs 卡片里授权）',
      ))
    }
    const device = conn.label === '' ? '未命名设备' : conn.label
    const rpcId = randomUUID()
    return new Promise((resolve, reject) => {
      const onAbort = (): void => {
        if (this.settle(rpcId) === undefined) return
        try {
          this.send(conn, { type: 'cancel', rpcId })
        } catch {
          // 连接已断：取消帧无处可去，drop 路径已完成清理。
        }
        reject(new Error('browser-fs: call aborted by caller'))
      }
      const timer = setTimeout(() => {
        if (this.settle(rpcId) === undefined) return
        reject(new Error(`browser-fs: 设备「${device}」未在 ${String(this.requestTimeoutMs)}ms 内响应`))
      }, this.requestTimeoutMs)
      this.pending.set(rpcId, { conn, signal, onAbort, resolve, reject, timer })
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        this.send(conn, { type: 'call', rpcId, op, args })
      } catch (error) {
        if (this.settle(rpcId) !== undefined) reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
    // 结果帧在 accept 的 message 回调里 resolve 原始 value；这里补上设备标签。
      .then(value => ({ value, device }))
  }

  /** 取出并清理一次挂起调用（计时器 + abort 监听）；已完结返回 undefined。 */
  private settle(rpcId: string): Pending | undefined {
    const entry = this.pending.get(rpcId)
    if (entry === undefined) return undefined
    this.pending.delete(rpcId)
    clearTimeout(entry.timer)
    entry.signal.removeEventListener('abort', entry.onAbort)
    return entry
  }

  /** 终止全部连接并拒掉所有挂起调用（插件 dispose 时调用）。 */
  async close(): Promise<void> {
    for (const conn of this.conns) conn.ws.terminate()
    for (const rpcId of [...this.pending.keys()]) {
      this.settle(rpcId)?.reject(new Error('browser-fs: plugin disposed'))
    }
    await new Promise<void>((resolve) => {
      this.server.close(() => { resolve() })
      // noServer 模式下没有 listening server 时 close 回调可能不来；兜底直接 resolve。
      setImmediate(resolve)
    })
  }

  private accept(ws: WebSocket): void {
    const conn: Conn = { id: randomUUID(), ws, hasHandle: false, dirName: null, label: '' }
    this.conns.add(conn)
    // 新连接立刻补一份当前 roster，不必等别人变更。
    this.sendRoster(conn)
    ws.on('message', (data: WebSocket.RawData) => {
      const frame = parseBrowserFrame(data.toString())
      if (frame === null) return
      if (frame.type === 'state') {
        conn.hasHandle = frame.hasHandle
        conn.dirName = frame.dirName
        conn.label = frame.label
        this.broadcastRoster()
        return
      }
      const entry = this.settle(frame.rpcId)
      if (entry === undefined || entry.conn !== conn) return
      const device = conn.label === '' ? '未命名设备' : conn.label
      if (frame.ok) entry.resolve(frame.value)
      else entry.reject(new Error(`${frame.error ?? 'browser-fs: browser-side call failed'}（设备：${device}）`))
    })
    const drop = (): void => {
      this.conns.delete(conn)
      for (const rpcId of [...this.pending.keys()]) {
        const entry = this.pending.get(rpcId)
        if (entry === undefined || entry.conn !== conn) continue
        const device = conn.label === '' ? '未命名设备' : conn.label
        this.settle(rpcId)?.reject(new Error(`browser-fs: 设备「${device}」的标签页在调用中途断开`))
      }
      this.broadcastRoster()
    }
    ws.once('close', drop)
    ws.once('error', drop)
  }

  /** 组装当前执行者名单（仅 hasHandle=true 的连接进 executors）。 */
  private rosterFrame(): string {
    const executors = [...this.conns]
      .filter(conn => conn.hasHandle)
      .map(conn => ({ label: conn.label === '' ? '未命名设备' : conn.label, dirName: conn.dirName }))
    return JSON.stringify({ type: 'roster', executors })
  }

  /** 向全部在线连接广播 roster（任一连接 state 变化/断连时调用）。 */
  private broadcastRoster(): void {
    const raw = this.rosterFrame()
    for (const conn of this.conns) {
      if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(raw)
    }
  }

  /** 向单条连接发送 roster（新连接接入时的初始名单）。 */
  private sendRoster(conn: Conn): void {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(this.rosterFrame())
  }

  /**
   * Set 迭代序即插入序：取第一个声明 hasHandle 的连接 —— 多台设备同时
   * 持柄在线时执行者确定（先接入者先得），不会逐次调用漂移。
   */
  private pickExecutor(): Conn | undefined {
    for (const conn of this.conns) {
      if (conn.hasHandle) return conn
    }
    return undefined
  }

  private send(conn: Conn, frame: CallFrame | { type: 'cancel'; rpcId: string }): void {
    if (conn.ws.readyState !== WebSocket.OPEN) {
      throw new Error('browser-fs: browser tab websocket is not open')
    }
    conn.ws.send(JSON.stringify(frame), (error) => {
      // 发送失败由 close/error 事件路径统一回收 pending。
      if (error != null) conn.ws.terminate()
    })
  }
}

// ---------- 工具参数 / 输出类型（模型侧契约） ----------

interface ListArgs {
  path?: string
  recursive?: boolean
}

interface ReadArgs {
  path: string
  maxBytes?: number
}

interface WriteArgs {
  path: string
  content: string
}

interface Entry {
  path: string
  kind: 'file' | 'directory'
  size?: number
}

interface ListValue {
  entries: Entry[]
  truncated: boolean
  /** 执行者设备标签（host 侧注入，浏览器不回传）。 */
  device: string
}

interface ReadValue {
  content: string
  size: number
  truncated: boolean
  /** 执行者设备标签（host 侧注入，浏览器不回传）。 */
  device: string
}

interface WriteValue {
  path: string
  bytes: number
  /** 执行者设备标签（host 侧注入，浏览器不回传）。 */
  device: string
}

const NOT_HOST_FS = ' This operates on the local disk of the machine running the browser '
  + '(authorized via File System Access API), NOT on this host\'s filesystem.'

function text(text: string): ContentBlock[] {
  return [{ type: 'text', text }]
}

/**
 * 注册三个模型工具 + WS 通道。
 * @param ctx - 宿主上下文（webServer + tools）。
 * @param config - cordis.patch.yml 行内 config。
 */
export function apply(ctx: HostContext, config?: Config): void {
  const wsPath = typeof config?.wsPath === 'string' && config.wsPath.length > 0
    ? config.wsPath
    : DEFAULT_WS_PATH
  const requestTimeoutMs = typeof config?.requestTimeoutMs === 'number'
    && Number.isFinite(config.requestTimeoutMs) && config.requestTimeoutMs > 0
    ? config.requestTimeoutMs
    : 120_000
  const relay = new BrowserRelay(requestTimeoutMs)

  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: wsPath,
    handler: (req, socket, head) => {
      if (!isSameOrigin(req)) {
        rejectWebSocketUpgrade(socket)
        return
      }
      relay.handleUpgrade(req, socket, head)
    },
  }), 'browser-fs: ws upgrade route')

  // 同路径的 exact HTTP 行：非 upgrade 的 GET 回 426（路由存在性的显式信号，
  // 避免落到 SPA fallback）。
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: wsPath,
    handler: (_req, res) => {
      res.writeHead(426, { connection: 'Upgrade', upgrade: 'websocket' })
      res.end('upgrade required')
    },
  }), 'browser-fs: ws probe route')

  // 语法高亮懒加载 chunk（与 WS 通道同目录的 highlight.mjs）：client 半预览
  // 首次命中已映射语言时动态 import。随插件包分发，启动时读一次驻内存；
  // 文件缺失（旧安装未重 build）则不注册路由，client 侧退回纯文本预览。
  let highlightBody: Buffer | null = null
  try {
    highlightBody = readFileSync(new URL('./highlight.mjs', import.meta.url))
  } catch {
    highlightBody = null
  }
  if (highlightBody !== null) {
    const body = highlightBody
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: highlightModulePath(wsPath),
      handler: (_req, res) => {
        res.writeHead(200, {
          'content-type': 'text/javascript; charset=utf-8',
          'cache-control': 'no-cache',
        })
        res.end(body)
      },
    }), 'browser-fs: highlight module route')
  }

  ctx.effect(() => () => relay.close(), 'browser-fs: relay teardown')

  ctx.effect(() => ctx.tools.register(defineTool<ListArgs, ListValue>({
    name: 'browser_fs_list',
    description: 'List files and directories inside the local directory the user authorized in the dsh web page.'
      + NOT_HOST_FS
      + ' `path` is relative to the authorized root (omit for the root itself).'
      + ' Set `recursive` to true to walk subdirectories.'
      + ' Requires a connected browser tab holding an authorized directory; fails fast otherwise.',
    parameters: {
      path: { type: 'string', description: 'Directory path relative to the authorized root; omit for the root.' },
      recursive: { type: 'boolean', description: 'Walk subdirectories depth-first when true (default false).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entries: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['file', 'directory'] },
                size: { type: 'integer' },
              },
            },
          },
          truncated: { type: 'boolean', required: true },
          device: { type: 'string', required: true },
        },
      },
      render: (args, value) => {
        const base = args.path === undefined || args.path === '' ? '(root)' : args.path
        const lines = value.entries.map(entry => entry.kind === 'directory'
          ? `${entry.path}/`
          : `${entry.path}${entry.size === undefined ? '' : ` (${String(entry.size)} B)`}`)
        const head = `${base} 共 ${String(value.entries.length)} 条（设备：${value.device}${value.truncated ? '，已截断' : ''}）：`
        return text([head, ...lines].join('\n'))
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec: ToolRunContext) {
      const outcome = await relay.call('list', {
        ...(args.path !== undefined ? { path: args.path } : {}),
        ...(args.recursive !== undefined ? { recursive: args.recursive } : {}),
      }, exec.signal)
      return { ...(outcome.value as Omit<ListValue, 'device'>), device: outcome.device }
    },
  })), 'browser-fs: browser_fs_list')

  ctx.effect(() => ctx.tools.register(defineTool<ReadArgs, ReadValue>({
    name: 'browser_fs_read',
    description: 'Read a UTF-8 text file from the local directory the user authorized in the dsh web page.'
      + NOT_HOST_FS
      + ' `path` is relative to the authorized root.'
      + ' Content beyond `maxBytes` (default 262144) is truncated and marked as such.',
    parameters: {
      path: { type: 'string', required: true, description: 'File path relative to the authorized root.' },
      maxBytes: { type: 'integer', description: 'Maximum bytes to read (default 262144 = 256 KiB).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          content: { type: 'string', required: true },
          size: { type: 'integer', required: true },
          truncated: { type: 'boolean', required: true },
          device: { type: 'string', required: true },
        },
      },
      render: (args, value) => {
        const prefix = `[设备：${value.device} · ${args.path} 共 ${String(value.size)} 字节${value.truncated ? '，已截断' : ''}]\n`
        return text(`${prefix}${value.content}`)
      },
    },
    isConcurrencySafe: () => true,
    async execute(args, exec: ToolRunContext) {
      const outcome = await relay.call('read', {
        path: args.path,
        ...(args.maxBytes !== undefined ? { maxBytes: args.maxBytes } : {}),
      }, exec.signal)
      return { ...(outcome.value as Omit<ReadValue, 'device'>), device: outcome.device }
    },
  })), 'browser-fs: browser_fs_read')

  ctx.effect(() => ctx.tools.register(defineTool<WriteArgs, WriteValue>({
    name: 'browser_fs_write',
    description: 'Write a UTF-8 text file into the local directory the user authorized in the dsh web page.'
      + NOT_HOST_FS
      + ' `path` is relative to the authorized root; parent directories are created automatically.'
      + ' Existing files are overwritten. Returns the number of bytes written.',
    parameters: {
      path: { type: 'string', required: true, description: 'File path relative to the authorized root.' },
      content: { type: 'string', required: true, description: 'Full UTF-8 text content to write.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          device: { type: 'string', required: true },
        },
      },
      render: (_args, value) => text(`已写入 ${String(value.bytes)} 字节到 ${value.path}（设备：${value.device}）`),
    },
    async execute(args, exec: ToolRunContext) {
      const outcome = await relay.call('write', { path: args.path, content: args.content }, exec.signal)
      return { ...(outcome.value as Omit<WriteValue, 'device'>), device: outcome.device }
    },
  })), 'browser-fs: browser_fs_write')
}

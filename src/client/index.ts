/**
 * dsh-browser-fs client 半（浏览器）：连回 host 半的 WS 通道，接收 call 帧、
 * 在本机授权目录上执行 File System Access 操作、回发 result 帧；同时把
 * 授权卡片注册进 shell.overlay 层。句柄持久化在 IndexedDB（store.ts），
 * 启动时读回并 queryPermission 检查。
 *
 * 产物契约：esbuild 打成 CJS 闭包，首尾包装 window.__ModuleLoader__.load
 * （见 build.mjs）；external 仅 react / react/jsx-runtime（模块表回答）。
 * @module dsh-browser-fs/client
 */

import { DEFAULT_WS_PATH, parseHostFrame, type ResultFrame } from '../wire.js'
import { executeOp } from './fs.js'
import { clearHandle, loadHandle, saveHandle } from './store.js'
import { createCard, type BrowserFsState } from './ui.js'

/** 必需服务：slot 注册表（授权卡片挂 shell.overlay）。 */
export const inject = ['slots']

/** apply 实际读到的 client ctx 面（cordis-client-runner 的 guard 代理兼容它）。 */
interface ClientCtx {
  effect(fn: () => void | (() => void), label?: string): void
  slots: {
    inject(name: string, fn: () => unknown): unknown
    register(options: Record<string, unknown>, component: unknown): () => void
  }
}

/**
 * Client 插件体：状态源 + WS 生命周期 + call 执行 + 授权卡片注册。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientCtx): void {
  const COLLAPSED_KEY = 'dsh-browser-fs:collapsed'
  const storedCollapsed = ((): boolean | null => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY)
      return raw === null ? null : raw === '1'
    } catch {
      // 隐私模式等场景 localStorage 不可用：当作无存储偏好。
      return null
    }
  })()
  // 用户显式收起/展开过（含上次刷新留下的存储值）后不再随权限状态改默认值。
  let collapseTouched = storedCollapsed !== null

  let state: BrowserFsState = {
    wsConnected: false,
    permission: 'none',
    dirName: null,
    busy: false,
    error: null,
    collapsed: storedCollapsed ?? false,
    root: null,
    rootVersion: 0,
  }
  const listeners = new Set<() => void>()
  const setState = (patch: Partial<BrowserFsState>): void => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }

  let handle: FileSystemDirectoryHandle | null = null
  let rootVersion = 0
  /** 句柄变更的统一入口：同步 snapshot 里的 root 引用并 bump 版本（目录树据此重置）。 */
  const setHandle = (next: FileSystemDirectoryHandle | null): void => {
    handle = next
    rootVersion += 1
    setState({ root: next, rootVersion })
  }
  let ws: WebSocket | null = null
  let disposed = false
  let retryMs = 1000
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const inflight = new Map<string, AbortController>()

  /** 只有「句柄在手 + readwrite 已授予」才算可执行。 */
  const ready = (): boolean => handle !== null && state.permission === 'granted'

  /** 向 host 广播当前授权状态（host 据此挑执行者）。 */
  const sendState = (): void => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'state',
        hasHandle: ready(),
        dirName: ready() ? state.dirName : null,
      }))
    }
  }

  const reply = (frame: ResultFrame): void => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
  }

  const onCall = async (rpcId: string, op: 'list' | 'read' | 'write', args: Record<string, unknown>): Promise<void> => {
    if (handle === null || !ready()) {
      reply({ type: 'result', rpcId, ok: false, error: 'browser-fs: this tab holds no authorized directory' })
      return
    }
    const abort = new AbortController()
    inflight.set(rpcId, abort)
    try {
      const value = await executeOp(handle, op, args, abort.signal)
      reply({ type: 'result', rpcId, ok: true, value })
    } catch (error) {
      reply({
        type: 'result',
        rpcId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      inflight.delete(rpcId)
    }
  }

  const onMessage = (raw: string): void => {
    const frame = parseHostFrame(raw)
    if (frame === null) return
    if (frame.type === 'cancel') {
      inflight.get(frame.rpcId)?.abort()
      return
    }
    void onCall(frame.rpcId, frame.op, frame.args)
  }

  const connect = (): void => {
    if (disposed) return
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws'
    const sock = new WebSocket(`${scheme}://${location.host}${DEFAULT_WS_PATH}`)
    ws = sock
    sock.onopen = () => {
      retryMs = 1000
      setState({ wsConnected: true })
      sendState()
    }
    sock.onmessage = (event) => {
      if (typeof event.data === 'string') onMessage(event.data)
    }
    sock.onclose = () => {
      if (ws === sock) {
        ws = null
        setState({ wsConnected: false })
      }
      if (!disposed) retryTimer = setTimeout(connect, retryMs)
      retryMs = Math.min(retryMs * 2, 10_000)
    }
    sock.onerror = () => { sock.close() }
  }

  /** 启动恢复：读回 IndexedDB 句柄并检查权限（不自动 requestPermission —— 需要用户手势）。 */
  const restore = async (): Promise<void> => {
    const stored = await loadHandle()
    if (stored === null) {
      setState({ permission: 'none', dirName: null })
      return
    }
    setHandle(stored)
    const permission = await stored.queryPermission({ mode: 'readwrite' })
    // 无存储偏好时的默认折叠：未授权（none，无句柄走上面的早退分支，初始即展开）
    // 保持展开引导授权；有句柄（granted/prompt/denied）默认折叠。
    if (!collapseTouched) setState({ collapsed: true })
    setState({ permission, dirName: stored.name })
    sendState()
  }

  /**
   * 环境阻断检查：两种情况下授权注定失败，提前给出可操作的中文引导而非
   * 甩浏览器原始报错。
   * 1. 非安全上下文（http://局域网IP）：showDirectoryPicker 直接不存在；
   * 2. 跨源 iframe（如 cenacle 网页浏览窗口）：浏览器禁止子框架弹文件
   *    选择器。授权在独立标签页完成一次即可——句柄按源持久化在
   *    IndexedDB，此后 iframe 内无需再弹。
   */
  const envBlocker = (): string | null => {
    if (typeof showDirectoryPicker !== 'function') {
      return '当前页面不是安全上下文（需 HTTPS 或 localhost），File System Access API 不可用'
    }
    if (window.self !== window.top) {
      return '嵌入窗口里无法弹出目录选择器：请点下方链接在独立标签页打开本页完成授权（一次即可，此后嵌入窗口内自动可用）'
    }
    return null
  }

  const actions = {
    authorize(): void {
      void (async () => {
        const blocker = envBlocker()
        if (blocker !== null) {
          setState({ error: blocker })
          return
        }
        setState({ busy: true, error: null })
        try {
          if (handle === null) {
            const picked = await showDirectoryPicker({ mode: 'readwrite' })
            setHandle(picked)
            await saveHandle(picked)
            setState({ permission: 'granted', dirName: picked.name })
          } else {
            const permission = await handle.requestPermission({ mode: 'readwrite' })
            setState({ permission, dirName: handle.name })
          }
          sendState()
        } catch (error) {
          // 用户关掉系统选择器/权限弹窗不是错误。
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setState({ error: error instanceof Error ? error.message : String(error) })
          }
        } finally {
          setState({ busy: false })
        }
      })()
    },
    pickNew(): void {
      void (async () => {
        const blocker = envBlocker()
        if (blocker !== null) {
          setState({ error: blocker })
          return
        }
        setState({ busy: true, error: null })
        try {
          const picked = await showDirectoryPicker({ mode: 'readwrite' })
          setHandle(picked)
          await saveHandle(picked)
          setState({ permission: 'granted', dirName: picked.name })
          sendState()
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setState({ error: error instanceof Error ? error.message : String(error) })
          }
        } finally {
          setState({ busy: false })
        }
      })()
    },
    revoke(): void {
      void (async () => {
        setHandle(null)
        await clearHandle()
        setState({ permission: 'none', dirName: null, error: null })
        sendState()
      })()
    },
    /** 收起/展开卡片；显式选择写 localStorage，此后不再随权限状态改默认值。 */
    toggleCollapsed(): void {
      const collapsed = !state.collapsed
      collapseTouched = true
      try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
      } catch {
        // localStorage 不可用时折叠状态只在本次页面存活。
      }
      setState({ collapsed })
    },
  }

  const card = createCard({
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => state,
    actions,
  })

  ctx.effect(() => {
    connect()
    void restore()
    return () => {
      disposed = true
      if (retryTimer !== undefined) clearTimeout(retryTimer)
      ws?.close()
      for (const controller of inflight.values()) controller.abort()
      inflight.clear()
    }
  }, 'browser-fs: websocket lifecycle')

  ctx.effect(() => {
    let dispose: (() => void) | undefined
    ctx.slots.inject('shell.overlay', () => {
      dispose = ctx.slots.register(
        { name: 'shell.overlay', id: 'browser-fs', order: 100, label: '浏览器文件' },
        card,
      )
      return dispose
    })
    return () => { dispose?.() }
  }, 'browser-fs: overlay card')
}

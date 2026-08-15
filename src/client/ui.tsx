/**
 * 授权入口 UI：一张挂在 shell.overlay 层的浮动卡片（layer 本身 click-through，
 * 卡片根元素自行恢复 pointer events）。显示 WS 连接状态、已授权目录名，
 * 提供 授权 / 重新授权 / 更换目录 / 解除授权 按钮。
 * @module dsh-browser-fs/client/ui
 */

import { useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'

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
}

/** 卡片动作（授权必须经过用户手势，全部挂按钮点击）。 */
export interface CardActions {
  /** 已有句柄时请求权限；无句柄时弹目录选择器。 */
  authorize(): void
  /** 弹目录选择器换一个新目录。 */
  pickNew(): void
  /** 清除持久化句柄，回到未授权状态。 */
  revoke(): void
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
  minWidth: '220px',
  maxWidth: '320px',
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

function statusColor(state: BrowserFsState): string {
  if (!state.wsConnected) return '#9aa0a6'
  if (state.permission === 'granted') return '#34a853'
  if (state.permission === 'none') return '#9aa0a6'
  return '#fbbc04'
}

function statusText(state: BrowserFsState): string {
  if (!state.wsConnected) return '未连接宿主（重连中）'
  switch (state.permission) {
    case 'granted': return `已授权：${state.dirName ?? ''}`
    case 'prompt': return '目录权限待确认'
    case 'denied': return '目录权限被拒绝'
    case 'none': return '未授权目录'
  }
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
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: statusColor(state), flexShrink: 0,
          }} />
          <strong>browser-fs 浏览器文件</strong>
        </div>
        <div style={{ marginBottom: '8px', opacity: 0.9 }}>{statusText(state)}</div>
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

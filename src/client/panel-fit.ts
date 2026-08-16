/**
 * 展开面板的视口钳位纯逻辑（DOM 无关，smoke 可断言）：以悬浮球位置为锚，
 * 优先翻转展开方向（球在右/下半屏就向左/上展开），翻转仍不够再 clamp
 * 进边距。只决定展开面板的显示位置，不改球的记忆位置。
 * @module dsh-browser-fs/client/panel-fit
 */

/** fixed 定位点（left/top，px）。 */
export interface Point {
  left: number
  top: number
}

/** 尺寸（px）。 */
export interface Size {
  width: number
  height: number
}

/** 悬浮球边长（px），翻转时对齐球缘用。 */
export const FAB_SIZE = 36

/** 展开面板与视口边缘的最小间距（px）。 */
export const PANEL_MARGIN = 10

/**
 * 计算展开面板的 fixed left/top。默认从球的位置向右下展开；球心在右半屏
 * 则面板右缘对齐球右缘（向左展开），球心在下半屏则面板底缘对齐球底缘
 * （向上展开）。翻转后仍出视口（含面板比视口还大的极端）时 clamp 进
 * 边距内，优先保住左上角。
 *
 * 仅用于「展开瞬间」的初始定位；面板一旦被用户拖动过或需要重钳位
 * （resize 等），用 clampPanelToViewport——翻转只该发生在展开时，
 * 否则松手/resize 会把用户摆好的面板拽走。
 * @param anchor - 悬浮球的 fixed 左上角。
 * @param panel - 展开面板当前实际尺寸。
 * @param viewport - 视口尺寸。
 * @returns 面板应处的 fixed 左上角（保证整个面板在视口内）。
 */
export function fitPanelToViewport(anchor: Point, panel: Size, viewport: Size): Point {
  const maxLeft = Math.max(PANEL_MARGIN, viewport.width - PANEL_MARGIN - panel.width)
  const maxTop = Math.max(PANEL_MARGIN, viewport.height - PANEL_MARGIN - panel.height)
  const left = anchor.left + FAB_SIZE / 2 > viewport.width / 2
    ? anchor.left + FAB_SIZE - panel.width
    : anchor.left
  const top = anchor.top + FAB_SIZE / 2 > viewport.height / 2
    ? anchor.top + FAB_SIZE - panel.height
    : anchor.top
  return {
    left: Math.min(Math.max(left, PANEL_MARGIN), maxLeft),
    top: Math.min(Math.max(top, PANEL_MARGIN), maxTop),
  }
}

/**
 * 展开面板的纯钳位（不翻转）：把整个面板 clamp 进边距内（优先保住左上角）。
 * 用于拖动松手/窗口 resize/内容撑高后的重钳位——尊重用户已摆好的位置。
 * @param pos - 面板当前（或期望）左上角。
 * @param panel - 面板当前实际尺寸。
 * @param viewport - 视口尺寸。
 */
export function clampPanelToViewport(pos: Point, panel: Size, viewport: Size): Point {
  return {
    left: Math.min(Math.max(pos.left, PANEL_MARGIN), Math.max(PANEL_MARGIN, viewport.width - PANEL_MARGIN - panel.width)),
    top: Math.min(Math.max(pos.top, PANEL_MARGIN), Math.max(PANEL_MARGIN, viewport.height - PANEL_MARGIN - panel.height)),
  }
}

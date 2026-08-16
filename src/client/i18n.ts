/**
 * 最小 i18n：中/英字典 + 语言信号读取跟随，不引第三方库。
 * 信号源：dsh web 的 UI 语言体现在 <html lang> 上（实测 zh-CN）；插件启动读一次，
 * 并用 MutationObserver 跟随其变化。<html lang> 缺失时退回 navigator.language。
 * @module dsh-browser-fs/client/i18n
 */

/** 支持的语言。 */
export type Lang = 'zh' | 'en'

/**
 * 语言标签 → Lang：zh 前缀（zh-CN/zh-TW/…）归中，其余归英（英文是回退档）。
 * @param tag - BCP47 语言标签（可为空串）。
 */
export function langFromTag(tag: string): Lang {
  return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/** 读取当前语言：<html lang> 优先，其次浏览器语言。 */
export function detectLang(): Lang {
  return langFromTag(document.documentElement.lang || navigator.language || '')
}

/**
 * 跟随 <html lang> 变化（dsh 切换 UI 语言时更新该属性）；返回退订函数。
 * @param listener - lang 属性变化时触发（调用方自行 detectLang 取新值）。
 */
export function subscribeLang(listener: () => void): () => void {
  const observer = new MutationObserver(listener)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
  return () => { observer.disconnect() }
}

/** 卡片/目录树/预览窗的全部用户可见文案（插值处用函数）。 */
export interface Strings {
  // ---- 状态行 ----
  statusNoHost: string
  statusGrantedCompat(dir: string, label: string): string
  statusGranted(dir: string, label: string): string
  statusPrompt: string
  statusDenied: string
  statusGrantElsewhere(whom: string): string
  statusNone: string
  // ---- 卡片 ----
  cardTitle: string
  collapseTip: string
  fabTip: string
  handleTip: string
  localLabel(label: string): string
  editNameTip: string
  namePlaceholder: string
  authorize: string
  reauthorize: string
  pickNew: string
  revoke: string
  clear: string
  compatDir: string
  compatFiles: string
  reselectDir: string
  reselectFiles: string
  refreshTipFull: string
  refreshTipCompat: string
  copyPath: string
  copyPathTip(path: string): string
  compatBadge: string
  compatDesc: string
  compatHowtoFull: string
  compatSsh: string
  compatFlag: string
  compatHttps: string
  iframeAuthLink: string
  // ---- 目录树 ----
  treeSection: string
  loading: string
  moreItems(n: number): string
  previewTip(path: string): string
  // ---- 预览窗 ----
  closeTip: string
  metaImage(size: string): string
  metaTruncated: string
  tooBig(size: string): string
  binary(size: string): string
  hlLoading: string
  // ---- 授权错误（index.ts 产出，经状态行展示） ----
  errDirEmpty: string
  errFilesEmpty: string
  errIframeBlocker: string
}

const zh: Strings = {
  statusNoHost: '未连接宿主（重连中）',
  statusGrantedCompat: (dir, label) => `已选择：${dir}（本机：${label}；兼容模式只读，刷新后需重选）`,
  statusGranted: (dir, label) => `已授权：${dir}（本机：${label}）`,
  statusPrompt: '目录权限待确认',
  statusDenied: '目录权限被拒绝',
  statusGrantElsewhere: whom => `当前授权在设备：${whom}`,
  statusNone: '未授权目录',
  cardTitle: 'browser-fs 浏览器文件',
  collapseTip: '收起',
  fabTip: '点击展开 · 按住可拖动',
  handleTip: '拖拽移动卡片',
  localLabel: label => `本机：${label}`,
  editNameTip: '编辑设备昵称',
  namePlaceholder: '留空用 UA 派生标签',
  authorize: '授权目录',
  reauthorize: '重新授权',
  pickNew: '更换目录',
  revoke: '解除授权',
  clear: '清除',
  compatDir: '选择目录',
  compatFiles: '选多个文件',
  reselectDir: '重选目录',
  reselectFiles: '选文件',
  refreshTipFull: '刷新目录',
  refreshTipCompat: '刷新目录（重新选择）',
  copyPath: '复制路径',
  copyPathTip: path => `复制相对路径：${path}`,
  compatBadge: '兼容模式',
  compatDesc: '当前页面非安全上下文，File System Access API 不可用：只能只读浏览，刷新后需重选。',
  compatHowtoFull: '获得完整模式（可写 + 持久授权）：',
  compatSsh: '① SSH 转发：ssh -L 9101:127.0.0.1:9101 用户@主机',
  compatFlag: '② Chrome：chrome://flags/#unsafely-treat-insecure-origin-as-secure',
  compatHttps: '③ 改用 HTTPS 访问',
  iframeAuthLink: '↗ 在独立标签页打开本页完成授权',
  treeSection: '目录内容',
  loading: '加载中…',
  moreItems: n => `…还有 ${String(n)} 项`,
  previewTip: path => `点击预览：${path}`,
  closeTip: '关闭（Esc）',
  metaImage: size => `图片 · ${size}`,
  metaTruncated: '仅前 64KB',
  tooBig: size => `图片太大（${size}），超过 8MB 不预览`,
  binary: size => `二进制文件不支持预览（${size}）`,
  hlLoading: '语法着色加载中…',
  errDirEmpty: '没读到文件——你的浏览器可能不支持整目录选择，请改用「选多个文件」',
  errFilesEmpty: '没读到文件，请重试或换个浏览器',
  errIframeBlocker: '嵌入窗口里无法弹出目录选择器：请点下方链接在独立标签页打开本页完成授权（一次即可，此后嵌入窗口内自动可用）',
}

const en: Strings = {
  statusNoHost: 'Host disconnected (reconnecting)',
  statusGrantedCompat: (dir, label) => `Selected: ${dir} (this device: ${label}; compat mode is read-only, re-pick after reload)`,
  statusGranted: (dir, label) => `Authorized: ${dir} (this device: ${label})`,
  statusPrompt: 'Directory permission pending',
  statusDenied: 'Directory permission denied',
  statusGrantElsewhere: whom => `Authorization lives on: ${whom}`,
  statusNone: 'No directory authorized',
  cardTitle: 'browser-fs Browser Files',
  collapseTip: 'Collapse',
  fabTip: 'Click to expand · hold to drag',
  handleTip: 'Drag to move card',
  localLabel: label => `This device: ${label}`,
  editNameTip: 'Edit device nickname',
  namePlaceholder: 'Leave empty for UA-derived label',
  authorize: 'Authorize directory',
  reauthorize: 'Re-authorize',
  pickNew: 'Switch directory',
  revoke: 'Revoke',
  clear: 'Clear',
  compatDir: 'Pick directory',
  compatFiles: 'Pick files',
  reselectDir: 'Re-pick dir',
  reselectFiles: 'Pick files',
  refreshTipFull: 'Refresh directory',
  refreshTipCompat: 'Refresh (re-pick)',
  copyPath: 'Copy path',
  copyPathTip: path => `Copy relative path: ${path}`,
  compatBadge: 'Compat mode',
  compatDesc: 'Insecure context: the File System Access API is unavailable — read-only browsing; re-pick after reload.',
  compatHowtoFull: 'Get full mode (writable + persistent grant):',
  compatSsh: '① SSH forward: ssh -L 9101:127.0.0.1:9101 user@host',
  compatFlag: '② Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure',
  compatHttps: '③ Switch to HTTPS',
  iframeAuthLink: '↗ Open this page in a standalone tab to authorize',
  treeSection: 'Contents',
  loading: 'Loading…',
  moreItems: n => `…${String(n)} more`,
  previewTip: path => `Click to preview: ${path}`,
  closeTip: 'Close (Esc)',
  metaImage: size => `Image · ${size}`,
  metaTruncated: 'first 64KB only',
  tooBig: size => `Image too large (${size}); over 8MB, not previewed`,
  binary: size => `Binary file, no preview (${size})`,
  hlLoading: 'Loading syntax highlighting…',
  errDirEmpty: 'No files read — your browser may not support directory picking; use "Pick files" instead',
  errFilesEmpty: 'No files read; please retry or use another browser',
  errIframeBlocker: 'Embedded windows cannot open the directory picker: use the link below to open this page in a standalone tab and authorize (once; the embedded window then works automatically)',
}

/** 语言 → 字典。 */
export const STRINGS: Readonly<Record<Lang, Strings>> = { zh, en }

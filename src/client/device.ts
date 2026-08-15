/**
 * 设备标签派生：从 User-Agent 最小解析出「OS · 浏览器」形态的标签
 * （如 "Windows · Chrome" / "Android · Chrome" / "macOS · Safari"）。
 * 刻意最小实现，不引依赖；昵称（localStorage）优先于本派生值。
 * @module dsh-browser-fs/client/device
 */

/** 解析 OS。顺序敏感：CrOS/Android 的 UA 含 Linux，iOS 的 UA 可能含 Mac。 */
function parseOs(ua: string): string {
  if (/Windows NT/i.test(ua)) return 'Windows'
  if (/CrOS/i.test(ua)) return 'ChromeOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return '未知系统'
}

/** 解析浏览器。顺序敏感：Edge/Opera 的 UA 含 Chrome，Chrome 的 UA 含 Safari。 */
function parseBrowser(ua: string): string {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'Edge'
  if (/OPR\//i.test(ua)) return 'Opera'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Safari\//i.test(ua)) return 'Safari'
  return '未知浏览器'
}

/**
 * 从 UA 串派生设备标签。
 * @param ua - navigator.userAgent。
 * @returns 「OS · 浏览器」标签。
 */
export function deriveDeviceLabel(ua: string): string {
  return `${parseOs(ua)} · ${parseBrowser(ua)}`
}

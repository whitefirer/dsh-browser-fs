/**
 * 文件轻量预览的纯函数与常量：按扩展名分图片/文本，图片走 blob URL，
 * 文本只取前 64KB UTF-8 解码，解码后含 NUL 视为二进制。
 * 两模式共用（完整模式句柄 / 兼容模式 File 映射都能给出 Blob）。
 * @module dsh-browser-fs/client/preview
 */

/** 可按 <img> 预览的图片扩展名（小写，不含点）。 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp',
])

/** 图片预览的大小上限（8 MiB）：超过不拉取，直接提示太大。 */
export const MAX_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024

/** 文本预览只取文件前 64 KiB（截断会在预览层标注）。 */
export const TEXT_PREVIEW_BYTES = 64 * 1024

export type PreviewKind = 'image' | 'text'

/**
 * 取文件名扩展名（小写）。无扩展名、点开头文件（如 `.gitignore`）返回 ''。
 * @param name - 文件名或相对路径（只看最后一段）。
 */
export function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * 按扩展名判断预览类型：图片扩展名 → image，其余一律按文本尝试。
 * @param name - 文件名或相对路径。
 */
export function previewKindFor(name: string): PreviewKind {
  return IMAGE_EXTENSIONS.has(extensionOf(name)) ? 'image' : 'text'
}

/**
 * UTF-8 解码后的二进制嗅探：含 NUL 字符即视为二进制，不按文本展示。
 * @param text - 已解码文本。
 */
export function looksBinary(text: string): boolean {
  return text.includes('\0')
}

/**
 * 图片扩展名 → MIME。建 blob 时显式给 type：File System Access 的 getFile()
 * 不一定带正确 type（svg 缺 type 时 <img> 渲染不出）。
 * @param name - 文件名或相对路径。
 */
export function imageMimeFor(name: string): string {
  switch (extensionOf(name)) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'svg': return 'image/svg+xml'
    case 'ico': return 'image/x-icon'
    case 'bmp': return 'image/bmp'
    default: return 'application/octet-stream'
  }
}

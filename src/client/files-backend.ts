/**
 * 兼容模式后端：`<input type="file" webkitdirectory>`（或 multiple 兜底）选出的
 * File 对象建「相对路径 → File」内存映射，提供与句柄后端同形的只读能力
 * （list/read/目录树分级）。目录从路径前缀推断（File 映射没有显式目录条目）。
 * 无 IndexedDB 持久化，刷新后需重选。
 *
 * 只读边界：write 抛 READ_ONLY_ERROR。
 * @module dsh-browser-fs/client/files-backend
 */

import {
  READ_ONLY_ERROR,
  type EntryResult,
  type FsBackend,
  type LevelResult,
  type ListResult,
  type ReadResult,
  type WriteResult,
} from './fs.js'

/** 与 fs.ts 的 LIST_LIMIT 对齐（wire list 上限）。 */
const LIST_LIMIT = 1000

/** read 默认字节上限（与 fs.ts DEFAULT_MAX_BYTES 一致，256 KiB）。 */
const DEFAULT_MAX_BYTES = 256 * 1024

function asString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

/** 相对路径校验：与 fs.ts splitPath 同规则（拒绝 `..` 逃逸）。 */
function splitPath(path: string): string[] {
  const segments = path.split('/').filter(seg => seg.length > 0 && seg !== '.')
  if (segments.some(seg => seg === '..')) {
    throw new Error(`path escapes the selected root: ${path}`)
  }
  return segments
}

/** 一级子项聚合：直接子目录名集合 + 直接子文件条目。 */
interface LevelScan {
  dirs: Set<string>
  files: { name: string; size: number }[]
}

/**
 * 扫描映射表，取 path 前缀下的直接子项。
 * @param map - 相对路径 → File。
 * @param path - 父级路径（'' 为根）。
 */
function scanLevel(map: ReadonlyMap<string, File>, path: string): LevelScan {
  const prefix = path === '' ? '' : `${path}/`
  const dirs = new Set<string>()
  const files: { name: string; size: number }[] = []
  for (const [p, file] of map) {
    if (!p.startsWith(prefix)) continue
    const rest = p.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) files.push({ name: rest, size: file.size })
    else dirs.add(rest.slice(0, slash))
  }
  return { dirs, files }
}

/**
 * 用选中的 File 列表构建只读后端。
 * @param files - input[webkitdirectory] 或 input[multiple] 的 FileList 内容。
 * @returns 后端 + 显示名（webkitdirectory 为所选目录名；multiple 为「N 个文件」）。
 */
export function createFilesBackend(files: File[]): { backend: FsBackend; dirName: string } {
  const map = new Map<string, File>()
  let dirName: string | null = null
  for (const file of files) {
    // webkitdirectory 模式浏览器给相对路径；multiple 兜底/异常环境下可能是
    // '' 或 undefined（如 Node 的 File 无此属性），按平铺处理。
    const relative = typeof file.webkitRelativePath === 'string' && file.webkitRelativePath !== ''
      ? file.webkitRelativePath
      : ''
    if (relative === '') {
      // multiple 兜底：没有目录结构，平铺文件名。
      map.set(file.name, file)
    } else {
      const segments = relative.split('/')
      dirName ??= segments[0] ?? null
      // 剥掉首段（所选目录自身），路径相对所选根。
      map.set(segments.slice(1).join('/'), file)
    }
  }
  // 去掉空 key 防御（畸形 webkitRelativePath）。
  for (const key of [...map.keys()]) {
    if (key === '') map.delete(key)
  }
  const displayName = dirName ?? `${String(files.length)} 个文件`

  const backend: FsBackend = {
    readOnly: true,

    async list(args: Record<string, unknown>, signal: AbortSignal): Promise<ListResult> {
      const path = asString(args.path, 'path') ?? ''
      splitPath(path) // 仅校验逃逸
      const recursive = args.recursive === true
      const prefix = path === '' ? '' : `${path}/`
      const entries: EntryResult[] = []
      let truncated = false

      if (recursive) {
        const dirs = new Set<string>()
        const fileEntries: EntryResult[] = []
        for (const [p, file] of map) {
          if (signal.aborted) throw new Error('aborted')
          if (!p.startsWith(prefix)) continue
          // 中间各级目录补为条目（含 path 自身各级不含 —— 只列子级）。
          const rest = p.slice(prefix.length)
          const parts = rest.split('/')
          for (let i = 1; i < parts.length; i++) dirs.add(prefix + parts.slice(0, i).join('/'))
          fileEntries.push({ path: p, kind: 'file', size: file.size })
        }
        const dirEntries: EntryResult[] = [...dirs].sort().map(p => ({ path: p, kind: 'directory' }))
        for (const entry of [...dirEntries, ...fileEntries]) {
          if (entries.length >= LIST_LIMIT) {
            truncated = true
            break
          }
          entries.push(entry)
        }
      } else {
        const scan = scanLevel(map, path)
        const sortedDirs = [...scan.dirs].sort((a, b) => a.localeCompare(b))
        const sortedFiles = [...scan.files].sort((a, b) => a.name.localeCompare(b.name))
        for (const name of sortedDirs) {
          if (entries.length >= LIST_LIMIT) {
            truncated = true
            break
          }
          entries.push({ path: prefix + name, kind: 'directory' })
        }
        if (!truncated) {
          for (const f of sortedFiles) {
            if (entries.length >= LIST_LIMIT) {
              truncated = true
              break
            }
            entries.push({ path: prefix + f.name, kind: 'file', size: f.size })
          }
        }
      }
      return { entries, truncated }
    },

    async read(args: Record<string, unknown>): Promise<ReadResult> {
      const path = asString(args.path, 'path')
      if (path === undefined || path === '') throw new Error('path is required')
      splitPath(path)
      const maxBytes = typeof args.maxBytes === 'number' && Number.isFinite(args.maxBytes) && args.maxBytes > 0
        ? Math.floor(args.maxBytes)
        : DEFAULT_MAX_BYTES
      const file = map.get(path)
      if (file === undefined) throw new Error(`no such file or directory: ${path}`)
      const truncated = file.size > maxBytes
      // slice 先行：截断时只物化前 maxBytes，避免整文件进内存。
      const blob = truncated ? file.slice(0, maxBytes) : file
      return { content: await blob.text(), size: file.size, truncated }
    },

    write(): Promise<WriteResult> {
      return Promise.reject(new Error(READ_ONLY_ERROR))
    },

    readBlob(path: string): Promise<Blob> {
      splitPath(path) // 仅校验逃逸
      const file = map.get(path)
      if (file === undefined) return Promise.reject(new Error(`no such file or directory: ${path}`))
      return Promise.resolve(file)
    },

    listLevel(path: string, limit: number): Promise<LevelResult> {
      splitPath(path)
      const { dirs, files: levelFiles } = scanLevel(map, path)
      const sortedDirs = [...dirs].sort((a, b) => a.localeCompare(b))
      const sortedFiles = [...levelFiles].sort((a, b) => a.name.localeCompare(b.name))
      const total = sortedDirs.length + sortedFiles.length
      const entries = [
        ...sortedDirs.map(name => ({ name, kind: 'directory' as const })),
        ...sortedFiles.map(f => ({ name: f.name, kind: 'file' as const, size: f.size })),
      ].slice(0, limit)
      return Promise.resolve({ entries, total })
    },
  }

  return { backend, dirName: displayName }
}

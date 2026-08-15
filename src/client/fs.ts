/**
 * File System Access 执行器：在浏览器里对授权根目录执行 list/read/write。
 * 所有 path 一律相对授权根目录，拒绝 `..` 逃逸。
 * @module dsh-browser-fs/client/fs
 */

import type { FsOp } from '../wire.js'
/** 单次 list 的条目上限（递归时汇总计算）。 */
const LIST_LIMIT = 1000

/** read 的默认字节上限（256 KiB）。 */
const DEFAULT_MAX_BYTES = 256 * 1024

export interface EntryResult {
  path: string
  kind: 'file' | 'directory'
  size?: number
}

export interface ListResult {
  entries: EntryResult[]
  truncated: boolean
}

export interface ReadResult {
  content: string
  size: number
  truncated: boolean
}

export interface WriteResult {
  path: string
  bytes: number
}

/**
 * 把模型给的相对路径拆成段；拒绝逃逸授权根的 `..`。
 * @param path - 相对路径（可为空串表示根）。
 * @returns 路径段数组。
 */
function splitPath(path: string): string[] {
  const segments = path.split('/').filter(seg => seg.length > 0 && seg !== '.')
  if (segments.some(seg => seg === '..')) {
    throw new Error(`path escapes the authorized root: ${path}`)
  }
  return segments
}

function asString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

async function walkDir(
  root: FileSystemDirectoryHandle,
  segments: readonly string[],
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  let dir = root
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create })
  }
  return dir
}

function describeFsError(path: string, error: unknown): Error {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return new Error(`no such file or directory: ${path}`)
  }
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * 从根句柄逐级取到某个子目录句柄（每次调用重新走 getDirectoryHandle，
 * 容忍外部 revoke/变化后拿到最新状态）。供目录树展开用。
 * @param root - 已授权根目录句柄。
 * @param path - 相对根的路径（空串为根自身）。
 * @returns 目标目录句柄。
 */
export async function resolveDir(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  try {
    return await walkDir(root, splitPath(path), false)
  } catch (error) {
    throw describeFsError(path === '' ? '(root)' : path, error)
  }
}

/** 目录树单级条目。 */
export interface LevelEntry {
  name: string
  kind: 'file' | 'directory'
  size?: number
}

/** 目录树单级列举结果：截断后的条目 + 该级真实总条目数。 */
export interface LevelResult {
  entries: LevelEntry[]
  total: number
}

/**
 * 列举一个目录的直接子级：目录在前文件在后、各自按名字排序；只取前 limit
 * 条（条目带文件大小），total 记录该级全部条目数供「…还有 N 项」显示。
 * @param dir - 目标目录句柄。
 * @param limit - 返回条目上限。
 * @returns 截断条目与总数。
 */
export async function listLevel(dir: FileSystemDirectoryHandle, limit: number): Promise<LevelResult> {
  const all: { name: string; kind: 'file' | 'directory'; handle: FileSystemDirectoryHandle | FileSystemFileHandle }[] = []
  for await (const handle of dir.values()) {
    all.push({ name: handle.name, kind: handle.kind, handle })
  }
  all.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'directory' ? -1 : 1) || a.name.localeCompare(b.name))
  const sliced = all.slice(0, limit)
  const entries: LevelEntry[] = []
  for (const item of sliced) {
    if (item.kind === 'directory') {
      entries.push({ name: item.name, kind: 'directory' })
    } else {
      const file = await (item.handle as FileSystemFileHandle).getFile()
      entries.push({ name: item.name, kind: 'file', size: file.size })
    }
  }
  return { entries, total: all.length }
}

async function listOp(root: FileSystemDirectoryHandle, args: Record<string, unknown>, signal: AbortSignal): Promise<ListResult> {
  const path = asString(args.path, 'path') ?? ''
  const recursive = args.recursive === true
  const segments = splitPath(path)
  const entries: EntryResult[] = []
  let truncated = false

  const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> => {
    for await (const handle of dir.values()) {
      if (signal.aborted) throw new Error('aborted')
      if (entries.length >= LIST_LIMIT) {
        truncated = true
        return
      }
      const childPath = prefix === '' ? handle.name : `${prefix}/${handle.name}`
      if (handle.kind === 'directory') {
        entries.push({ path: childPath, kind: 'directory' })
        if (recursive) await walk(handle, childPath, depth + 1)
        if (truncated) return
      } else {
        const file = await handle.getFile()
        entries.push({ path: childPath, kind: 'file', size: file.size })
      }
    }
  }

  let start: FileSystemDirectoryHandle
  try {
    start = await walkDir(root, segments, false)
  } catch (error) {
    throw describeFsError(path, error)
  }
  await walk(start, segments.join('/'), 0)
  return { entries, truncated }
}

async function readOp(root: FileSystemDirectoryHandle, args: Record<string, unknown>): Promise<ReadResult> {
  const path = asString(args.path, 'path')
  if (path === undefined || path === '') throw new Error('path is required')
  const maxBytes = typeof args.maxBytes === 'number' && Number.isFinite(args.maxBytes) && args.maxBytes > 0
    ? Math.floor(args.maxBytes)
    : DEFAULT_MAX_BYTES
  const segments = splitPath(path)
  const name = segments.pop()
  if (name === undefined) throw new Error('path must name a file, not the root directory')
  try {
    const dir = await walkDir(root, segments, false)
    const fileHandle = await dir.getFileHandle(name)
    const file = await fileHandle.getFile()
    const truncated = file.size > maxBytes
    const blob = truncated ? file.slice(0, maxBytes) : file
    return { content: await blob.text(), size: file.size, truncated }
  } catch (error) {
    throw describeFsError(path, error)
  }
}

async function writeOp(root: FileSystemDirectoryHandle, args: Record<string, unknown>, signal: AbortSignal): Promise<WriteResult> {
  const path = asString(args.path, 'path')
  if (path === undefined || path === '') throw new Error('path is required')
  const content = asString(args.content, 'content')
  if (content === undefined) throw new Error('content is required')
  const segments = splitPath(path)
  const name = segments.pop()
  if (name === undefined) throw new Error('path must name a file, not the root directory')
  const dir = await walkDir(root, segments, true)
  const fileHandle = await dir.getFileHandle(name, { create: true })
  const writable = await fileHandle.createWritable()
  if (signal.aborted) {
    await writable.close()
    throw new Error('aborted')
  }
  await writable.write(content)
  await writable.close()
  return { path, bytes: new TextEncoder().encode(content).length }
}

/**
 * 执行一次 host 下发的文件操作。
 * @param root - 已授权的目录句柄。
 * @param op - 操作名。
 * @param args - 操作参数（wire 边界，逐项校验）。
 * @param signal - 取消信号（cancel 帧驱动）。
 * @returns 可 JSON 序列化的结果。
 */
export function executeOp(
  root: FileSystemDirectoryHandle,
  op: FsOp,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ListResult | ReadResult | WriteResult> {
  if (op === 'list') return listOp(root, args, signal)
  if (op === 'read') return readOp(root, args)
  return writeOp(root, args, signal)
}

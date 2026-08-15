/**
 * IndexedDB 句柄持久化（最小封装）：FileSystemDirectoryHandle 是结构化可克隆
 * 对象，直接入库；启动时读回后由调用方做 queryPermission 检查。
 * @module dsh-browser-fs/client/store
 */

const DB_NAME = 'dsh-browser-fs'
const STORE = 'handles'
const KEY = 'root'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => { resolve(req.result) }
    req.onerror = () => { reject(req.error ?? new Error('indexedDB open failed')) }
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = run(tx.objectStore(STORE))
      req.onsuccess = () => { resolve(req.result) }
      req.onerror = () => { reject(req.error ?? new Error('indexedDB request failed')) }
      tx.onerror = () => { reject(tx.error ?? new Error('indexedDB transaction failed')) }
    })
  } finally {
    db.close()
  }
}

/**
 * 持久化授权目录句柄。
 * @param handle - 用户通过 showDirectoryPicker 授权的目录句柄。
 */
export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await withStore('readwrite', store => store.put(handle, KEY))
}

/**
 * 读回持久化的目录句柄。
 * @returns 句柄；从未授权或读回失败时为 null。
 */
export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const value = await withStore('readonly', store => store.get(KEY))
    return value instanceof FileSystemDirectoryHandle ? value : null
  } catch {
    // 句柄所在源被清库 / 结构损坏：当作从未授权。
    return null
  }
}

/** 清除持久化句柄（用户主动解除授权）。 */
export async function clearHandle(): Promise<void> {
  await withStore('readwrite', store => store.delete(KEY))
}

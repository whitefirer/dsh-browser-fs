/**
 * 本插件的链路自检（不依赖 dsh 进程，直接驱动安装态或本地构建的 lib/index.js）：
 * 用自己的 http server 承接插件注册的 upgrade 路由，再用 ws 客户端假扮浏览器
 * 标签页，验证 call→result 配对、abort、断连错误与 defineTool 参数校验。
 *
 * 用法：node scripts/smoke.mjs [lib/index.js 的绝对路径]（默认取本仓库 lib/）
 */
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import WebSocket from 'ws'

const pluginUrl = pathToFileURL(process.argv[2] ?? resolve('lib/index.js')).href
const plugin = await import(pluginUrl)

const tools = new Map()
let upgradeHandler = null
const disposers = []
const ctx = {
  effect(fn) {
    const dispose = fn()
    if (typeof dispose === 'function') disposers.push(dispose)
  },
  webServer: {
    register() { return () => {} },
    registerUpgrade(route) { upgradeHandler = route.handler; return () => {} },
  },
  tools: {
    register(def) { tools.set(def.name, def); return () => {} },
  },
}
plugin.apply(ctx, { wsPath: '/browser-fs/ws', requestTimeoutMs: 3000 })

const server = createServer((_req, res) => { res.writeHead(404); res.end() })
server.on('upgrade', (req, socket, head) => { upgradeHandler(req, socket, head) })
await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve) })
const port = server.address().port
const wsUrl = `ws://127.0.0.1:${String(port)}/browser-fs/ws`
const origin = { headers: { Origin: `http://127.0.0.1:${String(port)}` } }

let failures = 0
const check = (name, cond) => {
  console.log(`${cond ? 'ok' : 'FAIL'} - ${name}`)
  if (!cond) failures++
}

check('three tools registered', ['browser_fs_list', 'browser_fs_read', 'browser_fs_write'].every(n => tools.has(n)))

const exec = { signal: new AbortController().signal }

// 1. 无标签页：立即明确报错
await tools.get('browser_fs_list').execute({}, exec).then(
  () => check('no-tab error', false),
  (e) => check('no-tab error', e.message.includes('dsh 页面未在任何设备打开')),
)

// 2. defineTool 参数校验：read 缺 path
await tools.get('browser_fs_read').execute({}, exec).then(
  () => check('args validation', false),
  (e) => check('args validation', e.message.includes('invalid arguments')),
)

// 3. 完整往返：假浏览器持句柄上线，应答 call 帧；另挂一条 observer 连接验证 roster 广播
const LABEL = 'SmokeOS · Test'
const browser = new WebSocket(wsUrl, origin)
const observer = new WebSocket(wsUrl, origin)
const rosterSeen = []
// message 监听必须在 open 之前挂：host 在 accept 时立刻推初始 roster。
observer.on('message', (data) => {
  const frame = JSON.parse(data.toString())
  if (frame.type === 'roster') rosterSeen.push(frame.executors)
})
await new Promise((resolve, reject) => { browser.once('open', resolve); browser.once('error', reject) })
await new Promise((resolve, reject) => { observer.once('open', resolve); observer.once('error', reject) })
browser.send(JSON.stringify({ type: 'state', hasHandle: true, dirName: 'fake-root', label: LABEL }))
browser.on('message', (data) => {
  const frame = JSON.parse(data.toString())
  if (frame.type !== 'call') return
  const value = frame.op === 'list'
    ? { entries: [{ path: 'a.txt', kind: 'file', size: 3 }], truncated: false }
    : frame.op === 'read'
      ? { content: 'abc', size: 3, truncated: false }
      : { path: frame.args.path, bytes: 3 }
  browser.send(JSON.stringify({ type: 'result', rpcId: frame.rpcId, ok: true, value }))
})
await new Promise(resolve => setTimeout(resolve, 100)) // state 帧先到

// roster：observer 应先收到 []（接入时的初始名单），再收到含持柄设备的全量广播
check('roster broadcast', rosterSeen.length >= 2
  && rosterSeen[0].length === 0
  && rosterSeen.at(-1).length === 1
  && rosterSeen.at(-1)[0].label === LABEL
  && rosterSeen.at(-1)[0].dirName === 'fake-root')

const list = await tools.get('browser_fs_list').execute({}, exec)
check('list round-trip', list.entries?.[0]?.path === 'a.txt' && list.device === LABEL)
const read = await tools.get('browser_fs_read').execute({ path: 'a.txt' }, exec)
check('read round-trip', read.content === 'abc' && read.device === LABEL)
const written = await tools.get('browser_fs_write').execute({ path: 'b.txt', content: 'abc' }, exec)
check('write round-trip', written.bytes === 3 && written.device === LABEL)
console.log('render:', JSON.stringify(tools.get('browser_fs_write').output.render({ path: 'b.txt' }, written)[0].text))

// 4. 无持句柄标签：明确报错（先广播 hasHandle:false）
browser.send(JSON.stringify({ type: 'state', hasHandle: false, dirName: null, label: LABEL }))
await new Promise(resolve => setTimeout(resolve, 100))
await tools.get('browser_fs_list').execute({}, exec).then(
  () => check('no-handle error', false),
  (e) => check('no-handle error', e.message.includes('没有设备持有授权目录')),
)
check('roster empties on revoke', rosterSeen.at(-1).length === 0)

// 5. 断连错误：恢复可执行状态后掐线；错误文本带设备标签
browser.send(JSON.stringify({ type: 'state', hasHandle: true, dirName: 'fake-root', label: LABEL }))
await new Promise(resolve => setTimeout(resolve, 100))
const dangling = tools.get('browser_fs_list').execute({}, exec)
browser.removeAllListeners('message') // 不再应答
browser.terminate()
await dangling.then(
  () => check('disconnect error', false),
  (e) => check('disconnect error', e.message.includes('断开') && e.message.includes(LABEL)),
)
// drop 里先拒 pending（dangling 在此已完结）再广播 roster，TCP 投递是异步的，等一下再断言。
await new Promise(resolve => setTimeout(resolve, 100))
check('roster empties on disconnect', rosterSeen.at(-1).length === 0)
observer.close()

// 6. 跨源 Origin 被拒
const evil = new WebSocket(wsUrl, { headers: { Origin: 'http://evil.example.com' } })
await new Promise((resolve) => {
  evil.once('open', () => { check('cross-origin rejected', false); evil.close(); resolve() })
  evil.once('error', (e) => { check('cross-origin rejected', e.message.includes('403')); resolve() })
})

// 7. 兼容模式降级路径（headless）：esbuild 现场编译 files-backend/device，
// 用 Node 的全局 File 模拟 input 选中的文件列表（showDirectoryPicker 缺失的分支
// 在浏览器侧由 pickerAvailable 特性检测驱动，这里覆盖后端行为本身）。
{
  const { build } = await import('esbuild')
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const out = join(mkdtempSync(join(tmpdir(), 'bfs-smoke-')), 'compat.mjs')
  await build({
    entryPoints: ['src/client/files-backend.ts', 'src/client/device.ts'],
    outdir: join(out, '..', 'compat-out'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    logLevel: 'silent',
  })
  const backendUrl = new URL(`file://${join(out, '..', 'compat-out', 'files-backend.js')}`)
  const deviceUrl = new URL(`file://${join(out, '..', 'compat-out', 'device.js')}`)
  const { createFilesBackend } = await import(backendUrl.href)
  const { deriveDeviceLabel } = await import(deviceUrl.href)

  const mkFile = (content, relPath) => {
    const name = relPath.split('/').at(-1)
    const file = new File([content], name)
    Object.defineProperty(file, 'webkitRelativePath', { value: relPath })
    return file
  }
  const { backend, dirName } = createFilesBackend([
    mkFile('hello', 'Docs/a.txt'),
    mkFile('x'.repeat(300), 'Docs/sub/b.txt'),
    mkFile('root file', 'Docs/c.md'),
  ])
  check('compat dirName derived', dirName === 'Docs')
  check('compat readOnly flag', backend.readOnly === true)

  // 目录树分级：根级 = 目录 sub + 文件 a.txt/c.md（目录在前，文件按名排序）
  const rootLevel = await backend.listLevel('', 200)
  check('compat tree root level', rootLevel.total === 3
    && rootLevel.entries[0].kind === 'directory' && rootLevel.entries[0].name === 'sub'
    && rootLevel.entries[1].kind === 'file' && rootLevel.entries[1].name === 'a.txt'
    && rootLevel.entries[2].name === 'c.md' && rootLevel.entries[2].size === 9)
  const subLevel = await backend.listLevel('sub', 200)
  check('compat tree sub level', subLevel.total === 1 && subLevel.entries[0].name === 'b.txt')

  // wire list：非递归只列直接子级；递归含推断目录
  const listRoot = await backend.list({}, new AbortController().signal)
  check('compat list non-recursive', listRoot.entries.length === 3 && !listRoot.truncated)
  const listRec = await backend.list({ recursive: true }, new AbortController().signal)
  check('compat list recursive', listRec.entries.some(e => e.path === 'sub' && e.kind === 'directory')
    && listRec.entries.some(e => e.path === 'sub/b.txt' && e.kind === 'file'))

  // read：内容 + 截断
  const read = await backend.read({ path: 'sub/b.txt' })
  check('compat read', read.size === 300 && !read.truncated && read.content.length === 300)
  const readTrunc = await backend.read({ path: 'sub/b.txt', maxBytes: 10 })
  check('compat read truncated', readTrunc.truncated && readTrunc.content.length === 10 && readTrunc.size === 300)
  await backend.read({ path: 'nope.txt' }).then(
    () => check('compat read missing', false),
    (e) => check('compat read missing', e.message.includes('no such file')),
  )

  // write：只读拒绝，文案明确
  await backend.write({ path: 'x', content: 'y' }, new AbortController().signal).then(
    () => check('compat write rejected', false),
    (e) => check('compat write rejected', e.message === '兼容模式只读（当前页面非安全上下文，File System Access API 不可用）'),
  )

  // multiple 兜底（无 webkitRelativePath）：平铺文件名
  const multi = createFilesBackend([new File(['1'], 'one.txt'), new File(['22'], 'two.txt')])
  const multiRoot = await multi.backend.listLevel('', 200)
  check('compat multiple fallback', multi.dirName === '2 个文件'
    && multiRoot.total === 2 && multiRoot.entries.every(e => e.kind === 'file'))

  // UA 派生标签
  check('ua windows chrome', deriveDeviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36') === 'Windows · Chrome')
  check('ua android chrome', deriveDeviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36') === 'Android · Chrome')
  check('ua macos safari', deriveDeviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15') === 'macOS · Safari')
}

for (const dispose of disposers) await dispose()
server.close()
console.log(failures === 0 ? 'smoke: all ok' : `smoke: ${String(failures)} failure(s)`)
process.exit(failures === 0 ? 0 : 1)

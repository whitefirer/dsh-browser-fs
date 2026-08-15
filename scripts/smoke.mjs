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
  (e) => check('no-tab error', e.message.includes('no dsh web tab is connected')),
)

// 2. defineTool 参数校验：read 缺 path
await tools.get('browser_fs_read').execute({}, exec).then(
  () => check('args validation', false),
  (e) => check('args validation', e.message.includes('invalid arguments')),
)

// 3. 完整往返：假浏览器持句柄上线，应答 call 帧
const browser = new WebSocket(wsUrl, origin)
await new Promise((resolve, reject) => { browser.once('open', resolve); browser.once('error', reject) })
browser.send(JSON.stringify({ type: 'state', hasHandle: true, dirName: 'fake-root' }))
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

const list = await tools.get('browser_fs_list').execute({}, exec)
check('list round-trip', list.entries?.[0]?.path === 'a.txt')
const read = await tools.get('browser_fs_read').execute({ path: 'a.txt' }, exec)
check('read round-trip', read.content === 'abc')
const written = await tools.get('browser_fs_write').execute({ path: 'b.txt', content: 'abc' }, exec)
check('write round-trip', written.bytes === 3)
console.log('render:', tools.get('browser_fs_read').output.render({ path: 'a.txt' }, read)[0].text)

// 4. 无持句柄标签：明确报错（先广播 hasHandle:false）
browser.send(JSON.stringify({ type: 'state', hasHandle: false, dirName: null }))
await new Promise(resolve => setTimeout(resolve, 100))
await tools.get('browser_fs_list').execute({}, exec).then(
  () => check('no-handle error', false),
  (e) => check('no-handle error', e.message.includes('no connected tab has an authorized')),
)

// 5. 断连错误：恢复可执行状态后掐线
browser.send(JSON.stringify({ type: 'state', hasHandle: true, dirName: 'fake-root' }))
await new Promise(resolve => setTimeout(resolve, 100))
const dangling = tools.get('browser_fs_list').execute({}, exec)
browser.removeAllListeners('message') // 不再应答
browser.terminate()
await dangling.then(
  () => check('disconnect error', false),
  (e) => check('disconnect error', e.message.includes('disconnected mid-call')),
)

// 6. 跨源 Origin 被拒
const evil = new WebSocket(wsUrl, { headers: { Origin: 'http://evil.example.com' } })
await new Promise((resolve) => {
  evil.once('open', () => { check('cross-origin rejected', false); evil.close(); resolve() })
  evil.once('error', (e) => { check('cross-origin rejected', e.message.includes('403')); resolve() })
})

for (const dispose of disposers) await dispose()
server.close()
console.log(failures === 0 ? 'smoke: all ok' : `smoke: ${String(failures)} failure(s)`)
process.exit(failures === 0 ? 0 : 1)

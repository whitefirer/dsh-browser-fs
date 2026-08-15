# dsh-browser-fs

让 dsh 的 agent 读写**浏览器所在机器**的本地文件。dsh 自带的 fs 工具只能摸宿主机；
远程部署时浏览器在别的机器上，agent 够不到你本地的文件。本插件补上这个缺口：

用户在 dsh web 页面里通过 File System Access API（`showDirectoryPicker`）授权一个本地
目录，句柄存 IndexedDB；agent 通过三个模型工具 list/read/write 该目录下的文件，工具
调用经插件自建的 WebSocket 通道转发到浏览器执行。

## 原理

双面插件（cordis 插件体系）：

- **host 半**（`src/index.ts`，跑在 dsh 宿主 Node 进程）
  - `ctx.webServer.registerUpgrade` 注册精确路径 `/browser-fs/ws` 的 WS 通道；
  - `ctx.tools.register` 注册 `browser_fs_list` / `browser_fs_read` / `browser_fs_write`；
  - execute 把 `{type:'call', rpcId, op, args}` 帧发给「持有授权句柄」的标签页，按
    rpcId 配对 result 帧；`exec.signal` 接到 pending 的 abort（同时给浏览器发 cancel 帧）。
- **client 半**（`src/client/`，浏览器里跑）
  - 启动时从 IndexedDB 读回句柄并 `queryPermission`；连回 host 的 WS（断线指数退避重连）；
  - 收到 call 帧后在授权目录上执行 File System Access 操作，回发 result 帧；
  - 在 `shell.overlay` 层注册一张浮动卡片：显示连接/授权状态，提供
    授权目录 / 重新授权 / 更换目录 / 解除授权 按钮。
  - 授权状态变化时广播 `{type:'state', hasHandle, dirName}`；host 只把调用派给
    `hasHandle=true` 的标签页（多个标签在线时的执行者选择）。

## 安装

```sh
npm install
npm run build        # 产物 lib/index.js + lib/client.js（装机前必须先 build）
dsh plugin --profile web add file:/abs/path/to/dsh-browser-fs
# 重启 dsh 后生效
```

`dsh plugin add` 会把本包装进 profile 的 dependencies，并因 manifest 里的
`dsh.bundle.patch` 声明自动把 `dsh-browser-fs` 追加进 `dsh.profile.bundles` 层栈
（patch 内容即本仓库的 `cordis.patch.yml`：insert 一行挂 host 半，config 含
`wsPath` 与 `requestTimeoutMs`）。

## 使用

1. 打开 dsh web 页面，右下角出现「browser-fs 浏览器文件」卡片（未授权时默认展开；
   授权后默认折叠成 📁 圆钮，点圆钮展开，「—」收起；折叠状态存 localStorage，
   刷新保持，圆钮上的状态点颜色与卡片一致）；
2. 点「授权目录」，在系统选择器里选一个本地目录（需要 readwrite 权限）；
3. 卡片上的「目录内容」区可直接浏览授权目录：懒加载树（点目录行展开/收起，
   每级上限 200 条，超出显示「…还有 N 项」），文件行显示大小并带「复制路径」
   按钮（复制相对路径，方便贴给 AI）；
4. 之后 agent 即可使用三个工具：
   - `browser_fs_list { path?, recursive? }` — 列目录（相对路径/类型/大小，递归可选）
   - `browser_fs_read { path, maxBytes? }` — 读文本文件（默认上限 256 KiB，截断会标注）
   - `browser_fs_write { path, content }` — 写文本文件（自动创建父目录，返回字节数）

工具描述里明确告知模型：操作的是**浏览器机器**的本地盘，不是宿主机文件系统。

## 限制

- **secure context**：File System Access API 要求 HTTPS 或 localhost 上下文；
  纯 HTTP 远程访问页面时授权按钮会报明确错误。
- **标签页必须开着**：没有浏览器标签在线时，工具调用立即返回明确错误；
  有标签但没授权目录时同样立即报错。
- 只支持 UTF-8 文本读写（二进制/图片不在本插件范围）。
- client 半固定连默认 WS 路径 `/browser-fs/ws`；host 半若改了 `wsPath` 配置，
  client 半的 `DEFAULT_WS_PATH`（`src/wire.ts`）需同步修改并重新 build。
- host 半以 peerDependency 依赖 `@deepseek-ai/dsh-tools`（defineTool），运行时经
  profile 的扁平 node_modules 回退解析到 dsh 安装自带的同一份。

## 开发

```sh
npm run build      # esbuild：host 半 ESM + client 半 CJS 闭包（__ModuleLoader__ 包装）
npm run typecheck  # tsc --noEmit
npm run smoke      # 链路自检：call→result 往返 / abort / 断连 / 跨源拒绝（scripts/smoke.mjs）
```

改了代码后：重新 `npm run build`，然后 `dsh plugin --profile web add file:<本目录>`
重装一次（file: 依赖是打包拷贝，不是软链），再重启 dsh。

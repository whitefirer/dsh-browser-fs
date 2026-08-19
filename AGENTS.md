# AGENTS.md — dsh-browser-fs

> 用户面文档看 README.md / README_EN.md；本文件写给改代码的人/agent。

## 是什么

让 dsh 的 agent 读写**浏览器所在机器**的本地文件。双面插件：

- **host 半**（`src/index.ts`，dsh 宿主 Node 进程）：
  `ctx.webServer.registerUpgrade` 起精确路径 `/browser-fs/ws` 的 WebSocket；
  `ctx.tools.register` 注册 `browser_fs_list/read/write` 三个模型工具；
  工具调用按 `rpcId` 配对收发帧，`exec.signal` 接 abort（同时发 cancel 帧）。
- **client 半**（`src/client/`，浏览器）：启动从 IndexedDB 读回目录句柄
  `queryPermission`；连回 host WS（断线指数退避重连）；收到 call 帧用
  File System Access API 执行并回 result；在 `shell.overlay` 注册浮动卡片
  （连接/授权状态 + 授权/更换/解除按钮）。
- 多标签页在线时，host 只把调用派给 `hasHandle=true` 的标签页
  （client 广播 `{type:'state', hasHandle, dirName}`）。

## 构建与测试

```sh
npm install
npm run build       # node build.mjs → lib/
npm run typecheck   # tsc --noEmit
npm run smoke       # scripts/smoke.mjs
```

**`lib/` 构建产物是入库的**（安装零脚本，`dsh plugin add github:...` 直接可用）——
改完代码必须先 build 再提交，否则发出去的包是旧代码。

## 发布

推 `v*` tag 触发 GitHub Action 自动发 npm（`.github/workflows/publish.yml`，
secret `NPM_TOKEN`）：先改 package.json 版本号并合入主干，再打同号 tag——
workflow 会校验 tag 与版本号一致，不符直接失败。手动兜底：本机 `npm publish`
（`publishConfig` 已钉官方源，provenance 只有 CI 路径有）。

## 目录地图（src/client/）

| 文件 | 职责 |
|---|---|
| `index.ts` | client 入口、WS 重连、帧分发 |
| `fs.ts` | File System Access 操作实现（list/read/write） |
| `store.ts` | IndexedDB 句柄存取 |
| `ui.tsx` | 浮动卡片（preact） |
| `preview.ts` | 文件预览（图片/文本/代码高亮） |
| `highlight.ts` | 代码着色 |
| `compat-picker.ts` | 无 File System Access API 环境的降级选择器 |
| `device.ts` / `i18n.ts` | 设备判定 / 跟随 dsh 语言的中英文案 |
| `panel-fit.ts` | 悬浮面板定位防出界 |
| `files-backend.ts` | 后端抽象 |

## 关键坑（踩过）

- **安全上下文**：`showDirectoryPicker` 只在 https 或 localhost 可用。局域网
  `http://IP:端口` 访问会白屏/报错——cenacle 侧的解法是在反向代理注入
  `crypto.randomUUID` 等 polyfill（见 cenacle 的 docs/dsh-lan-access 文章），
  插件本身不要假设安全上下文。
- **跨域 iframe 里不能弹目录选择器**（Cross origin sub frames aren't allowed）：
  被市场页面的 iframe 嵌套时授权按钮必须走顶层页面。
- **移动端**：华为浏览器等报了 `showDirectoryPicker 可用` 但点了没反应，
  要兼容降级到 `<input type="file">` 多选模式（compat-picker）。
- **句柄随刷新失效是浏览器安全模型决定的**（permission 不跨会话持久时
  需重新授权），不是 bug；跨设备看到的"某设备的授权目录"要在 UI 上标清归属。
- i18n 跟随 dsh 的 Settings→General→Language，不要自己另搞语言开关。

## 发布

已收录进 awesome-dsh-plugin（徽章见 README）。发版：build → commit（含 lib/）→
push github → 按需打 tag。

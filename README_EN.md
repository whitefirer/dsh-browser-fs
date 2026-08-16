# dsh-browser-fs

[中文](README.md) | **English**

[![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin#tools--capabilities)

Lets dsh's agent read and write local files on **the machine where the browser runs**. dsh's
built-in fs tools can only reach the host machine; when dsh is deployed remotely, the browser
is on another machine and the agent cannot touch your local files. This plugin fills the gap:

The user authorizes a local directory in the dsh web page via the File System Access API
(`showDirectoryPicker`), and the handle is stored in IndexedDB; the agent works with three
model tools — list/read/write — whose calls are relayed to the browser over the plugin's own
WebSocket channel.

![agent calling browser_fs_read to read hello.txt from the authorized directory; the plugin card sits at bottom-right](docs/screenshot-in-action.png)

## How it works

A two-sided plugin (cordis plugin system):

- **Host half** (`src/index.ts`, runs in dsh's host Node process)
  - `ctx.webServer.registerUpgrade` registers the WS channel at the exact path `/browser-fs/ws`;
  - `ctx.tools.register` registers `browser_fs_list` / `browser_fs_read` / `browser_fs_write`;
  - execute sends a `{type:'call', rpcId, op, args}` frame to the tab "holding the authorized
    handle" and pairs result frames by rpcId; `exec.signal` is wired to pending-call abort
    (a cancel frame is also sent to the browser).
- **Client half** (`src/client/`, runs in the browser)
  - On startup, reads the handle back from IndexedDB and runs `queryPermission`; connects
    back to the host's WS (exponential-backoff reconnect);
  - Executes File System Access operations on the authorized directory when call frames
    arrive, and replies with result frames;
  - Registers a floating card in the `shell.overlay` layer: shows connection/authorization
    status and provides 授权目录 (authorize) / re-authorize / switch / revoke buttons.
  - Broadcasts `{type:'state', hasHandle, dirName}` on authorization changes; the host only
    dispatches calls to tabs with `hasHandle=true` (executor selection when multiple tabs
    are online).

## Installation

```sh
# Install from GitHub (recommended; build artifacts are committed, zero install scripts)
dsh plugin --profile web add github:whitefirer/dsh-browser-fs

# Local development: reinstall after changes (run npm run build first; lib/ is committed)
npm install
npm run build
dsh plugin --profile web add file:/abs/path/to/dsh-browser-fs
# Restart dsh to take effect
```

`dsh plugin add` installs the package into the profile's dependencies and, thanks to the
`dsh.bundle.patch` manifest declaration, automatically appends `dsh-browser-fs` to the
`dsh.profile.bundles` layer stack (the patch is this repo's `cordis.patch.yml`: one insert
line mounts the host half; its config carries `wsPath` and `requestTimeoutMs`).

## Usage

1. Open the dsh web page; the "browser-fs 浏览器文件" card appears at the bottom-right
   (expanded by default when unauthorized; collapses to a 📁 ball after authorization —
   click to expand, press-and-hold to drag, "—" to collapse; collapse state persists in
   localStorage across reloads, and the ball's status dot matches the card's colors);
2. Click 授权目录 (authorize) and pick a local directory in the system picker (readwrite
   permission required);
3. The card's 目录内容 (contents) section browses the authorized directory directly: a
   lazy-loaded tree (click a directory row to expand/collapse, 200 entries per level with
   a "…N more" overflow line); file rows show sizes and a 复制路径 (copy path) button that
   copies the relative path — handy for pasting to the AI;
4. The agent can then use the three tools:
   - `browser_fs_list { path?, recursive? }` — list a directory (relative path/kind/size, optional recursion)
   - `browser_fs_read { path, maxBytes? }` — read a text file (256 KiB cap by default, truncation marked)
   - `browser_fs_write { path, content }` — write a text file (parent directories auto-created, returns byte count)

The tool descriptions tell the model explicitly: these operate on the **browser machine's**
local disk, not the host's filesystem.

The card UI language follows the dsh page (reads `<html lang>` and reacts to changes live;
Chinese/English switch automatically).

## Preview & refresh

Click a **file name** in the contents tree to pop the preview window (mask + fixed-size
window, min(720px,92vw) × min(70vh,560px), not content-sized; pinned title bar — file name
+ size/truncation note + ✕, with the relative path below; content area scrolls
independently; ✕ / mask click / ESC to close):

- **Images** (png/jpg/jpeg/gif/webp/svg/ico/bmp): read as arrayBuffer into a blob URL shown
  with `<img>` (revokeObjectURL on close); images over 8MB are not fetched — a too-big
  notice is shown instead;
- **Everything else as text**: only the first 64KB, UTF-8 decoded, monospace `<pre>`;
  truncation is marked ("仅前 64KB"); decoded text containing NUL counts as binary and shows
  "二进制文件不支持预览" (binary files not supported).

Preview takes the same path in both modes (the full/compat backends each implement
`readBlob`), so it works in read-only compat mode too.

Text preview comes with **syntax highlighting**: the extension maps to a language
(js/ts/tsx/py/go/rs/java/c/cpp/h/sh/yaml/json/toml/md/html/css/xml/sql, etc.; unmapped
extensions stay plain text), and only the truncated first 64KB is highlighted. Highlighting
uses a highlight.js language subset with the GitHub Dark theme; to keep the main bundle
small it ships as a separate chunk — the host half serves it at `highlight.mjs` next to
`/browser-fs/ws`, and it is dynamically imported the first time a preview hits a mapped
language (plain text with a "语法着色加载中…" note while loading, silent fallback to plain
text on failure).

**The card is draggable**: the title row is the drag handle (mouse and touch; movement
beyond 4px counts as a drag, so collapse/button clicks are never eaten); the position is
remembered in localStorage (`dsh-browser-fs:card-pos`). While dragging, the panel/ball
tracks the pointer directly (no clamping intervenes); clamping kicks in only on release
and window resize: the ball always stays fully inside the viewport (flush to edges, no
hidden margins), while the expanded panel prefers flipping its expansion direction
(leftward/upward when the ball sits in the right/bottom half) and then clamps into a
10px margin if flipping is not enough (width/height capped to the viewport); the clamp
only affects the panel's display, not the ball's remembered position. The collapsed 📁
ball shares the same position as the card (wherever the card was dragged, the ball
appears there, and expanding restores the same spot); the ball is draggable too — a
release without movement expands the card. Card, ball and preview window render at body
level (z-100/200): above common overlays (e.g. sidebar-plugin panels) so clicks are never
stolen by other plugins, yet still below dsh's own modals (z-1000+).

The "↻" at the end of the authorization button row refreshes the directory:

- **Full mode**: clears all directory-tree caches (expanded set / loaded levels) and
  re-fetches the root level;
- **Compat mode**: the cache is the selection-time File snapshot and the browser allows no
  silent re-read, so refreshing is meaningless — the button reopens the picker instead
  (same as 重新选择).

## Multiple devices

Multiple devices can each keep a dsh page open; the model sees "each device authorizes its
own local directory":

- Each device's browser tab derives a device label from its UA (e.g. "Windows · Chrome" /
  "Android · Chrome" / "macOS · Safari"); click ✏️ on the card to set a nickname (stored in
  localStorage `dsh-browser-fs:device-name`; the nickname wins over UA derivation).
- Every tab reports `{hasHandle, dirName, label}` to the host; the host maintains an
  executor roster and broadcasts it to all online tabs. Devices without authorization see
  "当前授权在设备：某某（目录名）" on the card — no more guessing where the grant lives.
- Agent tool calls route to a handle-holding device: with several holders, the
  **first-connected** one wins (deterministic). Tool results and error messages carry the
  executor's label (e.g. "已写入 3 字节到 b.txt（设备：X）"), so the conversation shows which
  device ran the call.
- Authorize a directory on this machine and it joins the executors; when a device
  disconnects or revokes, the roster shrinks immediately.

## LAN/mobile access & secure context

The File System Access API is gated behind secure contexts: it only exists under HTTPS or
localhost. On LAN http (e.g. `http://192.168.0.x:9101`, common when a phone goes through a
proxy), `window.showDirectoryPicker` simply does not exist and cannot be polyfilled. This
plugin feature-detects with `typeof window.showDirectoryPicker === 'function'` (not
`isSecureContext` — a proxy-injected polyfill may have patched it), and falls back to
**compat mode** when missing. Capability differences:

| | Full mode | Compat mode |
| --- | --- | --- |
| Trigger | Secure context (HTTPS/localhost) | Automatic fallback on insecure contexts |
| Picking | System directory picker (showDirectoryPicker) | Dual entries: input[webkitdirectory] for directories / multiple for file multi-select |
| list / read | ✓ | ✓ (in-memory File map; read slices instead of loading whole files) |
| write / mutations | ✓ | ✗ explicit "兼容模式只读…" (compat mode is read-only) error |
| Grant persistence | ✓ IndexedDB, restored on reload | ✗ nothing to persist; re-pick after reload (noted in the status line) |
| Directory-tree browsing | ✓ | ✓ same path (the backend abstraction is shared) |

**Mobile behavior**: the compat authorization area offers two side-by-side entries —
选择目录 (pick directory) and 选多个文件 (pick files) — instead of relying on capability
probing alone; the picker input is positioned off-screen (not display:none, which mobile
browsers and the WeChat WebView block from programmatic clicks). On iOS, directory picking
may be a dead end (the webkitdirectory attribute exists but picking a directory returns 0
files): the card then shows a clear error ("没读到文件…请改用「选多个文件」") and the
directory entry silently switches to multi-select from then on — never silent. After a
successful pick, the status line shows what was selected (directory name or "N 个文件").

In compat mode the card shows a 兼容模式 (compat mode) badge with an explanation. Three ways
to get full mode:

1. SSH port-forward to localhost: `ssh -L 9101:127.0.0.1:9101 user@host`, then visit
   `http://127.0.0.1:9101`;
2. In Chrome, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and allowlist
   the LAN origin;
3. Deploy HTTPS.

## Limitations

- **Secure context**: the File System Access API requires an HTTPS or localhost context;
  over plain-HTTP remote access the authorize button fails with a clear error.
- **A tab must stay open**: with no browser tab online, tool calls fail fast with a clear
  error; same when tabs are online but no directory is authorized.
- The agent tools only support UTF-8 text read/write (binary writes are out of scope;
  images preview inside the card only — see "Preview & refresh").
- The client half always connects to the default WS path `/browser-fs/ws` (the highlight
  chunk path derives from the same directory: `/browser-fs/highlight.mjs`); if the host
  half's `wsPath` config is changed, the client's `DEFAULT_WS_PATH` (`src/wire.ts`) must be
  updated in sync and the bundle rebuilt.
- The host half peer-depends on `@deepseek-ai/dsh-tools` (defineTool); at runtime it
  resolves through the profile's flat node_modules fallback to the same copy bundled with
  the dsh installation.

## Development

```sh
npm run build      # esbuild: host half ESM + client half CJS closure (__ModuleLoader__ wrapped) + highlight lazy chunk (lib/highlight.mjs)
npm run typecheck  # tsc --noEmit
npm run smoke      # link self-check: call→result round-trip / abort / disconnect / cross-origin rejection (scripts/smoke.mjs)
```

After changing code: re-run `npm run build`, then `dsh plugin --profile web add
file:<this dir>` once more (file: dependencies are packed copies, not symlinks), and
restart dsh.

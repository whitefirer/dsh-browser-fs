window.__ModuleLoader__.load({ id: "dsh-browser-fs", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/wire.ts
var DEFAULT_WS_PATH = "/browser-fs/ws";
function highlightModulePath(wsPath) {
  const slash = wsPath.lastIndexOf("/");
  return `${slash <= 0 ? "" : wsPath.slice(0, slash)}/highlight.mjs`;
}
var DEFAULT_HIGHLIGHT_PATH = highlightModulePath(DEFAULT_WS_PATH);
var OPS = /* @__PURE__ */ new Set(["list", "read", "write"]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseHostFrame(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.type === "call" && typeof value.rpcId === "string" && typeof value.op === "string" && OPS.has(value.op) && isRecord(value.args)) {
    return { type: "call", rpcId: value.rpcId, op: value.op, args: value.args };
  }
  if (value.type === "cancel" && typeof value.rpcId === "string") {
    return { type: "cancel", rpcId: value.rpcId };
  }
  if (value.type === "roster" && Array.isArray(value.executors)) {
    const executors = [];
    for (const entry of value.executors) {
      if (!isRecord(entry) || typeof entry.label !== "string") return null;
      executors.push({
        label: entry.label,
        dirName: typeof entry.dirName === "string" ? entry.dirName : null
      });
    }
    return { type: "roster", executors };
  }
  return null;
}

// src/client/compat-picker.ts
function resolveCompatInput(mode, opts) {
  return { directory: mode === "directory" && opts.dirSupported && !opts.dirBroken };
}
function classifyCompatChange(fileCount, directoryInput) {
  if (fileCount > 0) return { kind: "selected", directory: directoryInput };
  return directoryInput ? { kind: "dir-empty" } : { kind: "files-empty" };
}

// src/client/device.ts
function parseOs(ua) {
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "\u672A\u77E5\u7CFB\u7EDF";
}
function parseBrowser(ua) {
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "\u672A\u77E5\u6D4F\u89C8\u5668";
}
function deriveDeviceLabel(ua) {
  return `${parseOs(ua)} \xB7 ${parseBrowser(ua)}`;
}

// src/client/i18n.ts
function langFromTag(tag) {
  return tag.toLowerCase().startsWith("zh") ? "zh" : "en";
}
function detectLang() {
  return langFromTag(document.documentElement.lang || navigator.language || "");
}
function subscribeLang(listener) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => {
    observer.disconnect();
  };
}
var zh = {
  statusNoHost: "\u672A\u8FDE\u63A5\u5BBF\u4E3B\uFF08\u91CD\u8FDE\u4E2D\uFF09",
  statusGrantedCompat: (dir, label) => `\u5DF2\u9009\u62E9\uFF1A${dir}\uFF08\u672C\u673A\uFF1A${label}\uFF1B\u517C\u5BB9\u6A21\u5F0F\u53EA\u8BFB\uFF0C\u5237\u65B0\u540E\u9700\u91CD\u9009\uFF09`,
  statusGranted: (dir, label) => `\u5DF2\u6388\u6743\uFF1A${dir}\uFF08\u672C\u673A\uFF1A${label}\uFF09`,
  statusPrompt: "\u76EE\u5F55\u6743\u9650\u5F85\u786E\u8BA4",
  statusDenied: "\u76EE\u5F55\u6743\u9650\u88AB\u62D2\u7EDD",
  statusGrantElsewhere: (whom) => `\u5F53\u524D\u6388\u6743\u5728\u8BBE\u5907\uFF1A${whom}`,
  statusNone: "\u672A\u6388\u6743\u76EE\u5F55",
  cardTitle: "browser-fs \u6D4F\u89C8\u5668\u6587\u4EF6",
  collapseTip: "\u6536\u8D77",
  fabTip: "\u70B9\u51FB\u5C55\u5F00 \xB7 \u6309\u4F4F\u53EF\u62D6\u52A8",
  handleTip: "\u62D6\u62FD\u79FB\u52A8\u5361\u7247",
  localLabel: (label) => `\u672C\u673A\uFF1A${label}`,
  editNameTip: "\u7F16\u8F91\u8BBE\u5907\u6635\u79F0",
  namePlaceholder: "\u7559\u7A7A\u7528 UA \u6D3E\u751F\u6807\u7B7E",
  authorize: "\u6388\u6743\u76EE\u5F55",
  reauthorize: "\u91CD\u65B0\u6388\u6743",
  pickNew: "\u66F4\u6362\u76EE\u5F55",
  revoke: "\u89E3\u9664\u6388\u6743",
  clear: "\u6E05\u9664",
  compatDir: "\u9009\u62E9\u76EE\u5F55",
  compatFiles: "\u9009\u591A\u4E2A\u6587\u4EF6",
  reselectDir: "\u91CD\u9009\u76EE\u5F55",
  reselectFiles: "\u9009\u6587\u4EF6",
  refreshTipFull: "\u5237\u65B0\u76EE\u5F55",
  refreshTipCompat: "\u5237\u65B0\u76EE\u5F55\uFF08\u91CD\u65B0\u9009\u62E9\uFF09",
  copyPath: "\u590D\u5236\u8DEF\u5F84",
  copyPathTip: (path) => `\u590D\u5236\u76F8\u5BF9\u8DEF\u5F84\uFF1A${path}`,
  compatBadge: "\u517C\u5BB9\u6A21\u5F0F",
  compatDesc: "\u5F53\u524D\u9875\u9762\u975E\u5B89\u5168\u4E0A\u4E0B\u6587\uFF0CFile System Access API \u4E0D\u53EF\u7528\uFF1A\u53EA\u80FD\u53EA\u8BFB\u6D4F\u89C8\uFF0C\u5237\u65B0\u540E\u9700\u91CD\u9009\u3002",
  compatHowtoFull: "\u83B7\u5F97\u5B8C\u6574\u6A21\u5F0F\uFF08\u53EF\u5199 + \u6301\u4E45\u6388\u6743\uFF09\uFF1A",
  compatSsh: "\u2460 SSH \u8F6C\u53D1\uFF1Assh -L 9101:127.0.0.1:9101 \u7528\u6237@\u4E3B\u673A",
  compatFlag: "\u2461 Chrome\uFF1Achrome://flags/#unsafely-treat-insecure-origin-as-secure",
  compatHttps: "\u2462 \u6539\u7528 HTTPS \u8BBF\u95EE",
  iframeAuthLink: "\u2197 \u5728\u72EC\u7ACB\u6807\u7B7E\u9875\u6253\u5F00\u672C\u9875\u5B8C\u6210\u6388\u6743",
  treeSection: "\u76EE\u5F55\u5185\u5BB9",
  loading: "\u52A0\u8F7D\u4E2D\u2026",
  moreItems: (n) => `\u2026\u8FD8\u6709 ${String(n)} \u9879`,
  previewTip: (path) => `\u70B9\u51FB\u9884\u89C8\uFF1A${path}`,
  closeTip: "\u5173\u95ED\uFF08Esc\uFF09",
  metaImage: (size) => `\u56FE\u7247 \xB7 ${size}`,
  metaTruncated: "\u4EC5\u524D 64KB",
  tooBig: (size) => `\u56FE\u7247\u592A\u5927\uFF08${size}\uFF09\uFF0C\u8D85\u8FC7 8MB \u4E0D\u9884\u89C8`,
  binary: (size) => `\u4E8C\u8FDB\u5236\u6587\u4EF6\u4E0D\u652F\u6301\u9884\u89C8\uFF08${size}\uFF09`,
  hlLoading: "\u8BED\u6CD5\u7740\u8272\u52A0\u8F7D\u4E2D\u2026",
  errDirEmpty: "\u6CA1\u8BFB\u5230\u6587\u4EF6\u2014\u2014\u4F60\u7684\u6D4F\u89C8\u5668\u53EF\u80FD\u4E0D\u652F\u6301\u6574\u76EE\u5F55\u9009\u62E9\uFF0C\u8BF7\u6539\u7528\u300C\u9009\u591A\u4E2A\u6587\u4EF6\u300D",
  errFilesEmpty: "\u6CA1\u8BFB\u5230\u6587\u4EF6\uFF0C\u8BF7\u91CD\u8BD5\u6216\u6362\u4E2A\u6D4F\u89C8\u5668",
  errIframeBlocker: "\u5D4C\u5165\u7A97\u53E3\u91CC\u65E0\u6CD5\u5F39\u51FA\u76EE\u5F55\u9009\u62E9\u5668\uFF1A\u8BF7\u70B9\u4E0B\u65B9\u94FE\u63A5\u5728\u72EC\u7ACB\u6807\u7B7E\u9875\u6253\u5F00\u672C\u9875\u5B8C\u6210\u6388\u6743\uFF08\u4E00\u6B21\u5373\u53EF\uFF0C\u6B64\u540E\u5D4C\u5165\u7A97\u53E3\u5185\u81EA\u52A8\u53EF\u7528\uFF09"
};
var en = {
  statusNoHost: "Host disconnected (reconnecting)",
  statusGrantedCompat: (dir, label) => `Selected: ${dir} (this device: ${label}; compat mode is read-only, re-pick after reload)`,
  statusGranted: (dir, label) => `Authorized: ${dir} (this device: ${label})`,
  statusPrompt: "Directory permission pending",
  statusDenied: "Directory permission denied",
  statusGrantElsewhere: (whom) => `Authorization lives on: ${whom}`,
  statusNone: "No directory authorized",
  cardTitle: "browser-fs Browser Files",
  collapseTip: "Collapse",
  fabTip: "Click to expand \xB7 hold to drag",
  handleTip: "Drag to move card",
  localLabel: (label) => `This device: ${label}`,
  editNameTip: "Edit device nickname",
  namePlaceholder: "Leave empty for UA-derived label",
  authorize: "Authorize directory",
  reauthorize: "Re-authorize",
  pickNew: "Switch directory",
  revoke: "Revoke",
  clear: "Clear",
  compatDir: "Pick directory",
  compatFiles: "Pick files",
  reselectDir: "Re-pick dir",
  reselectFiles: "Pick files",
  refreshTipFull: "Refresh directory",
  refreshTipCompat: "Refresh (re-pick)",
  copyPath: "Copy path",
  copyPathTip: (path) => `Copy relative path: ${path}`,
  compatBadge: "Compat mode",
  compatDesc: "Insecure context: the File System Access API is unavailable \u2014 read-only browsing; re-pick after reload.",
  compatHowtoFull: "Get full mode (writable + persistent grant):",
  compatSsh: "\u2460 SSH forward: ssh -L 9101:127.0.0.1:9101 user@host",
  compatFlag: "\u2461 Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure",
  compatHttps: "\u2462 Switch to HTTPS",
  iframeAuthLink: "\u2197 Open this page in a standalone tab to authorize",
  treeSection: "Contents",
  loading: "Loading\u2026",
  moreItems: (n) => `\u2026${String(n)} more`,
  previewTip: (path) => `Click to preview: ${path}`,
  closeTip: "Close (Esc)",
  metaImage: (size) => `Image \xB7 ${size}`,
  metaTruncated: "first 64KB only",
  tooBig: (size) => `Image too large (${size}); over 8MB, not previewed`,
  binary: (size) => `Binary file, no preview (${size})`,
  hlLoading: "Loading syntax highlighting\u2026",
  errDirEmpty: 'No files read \u2014 your browser may not support directory picking; use "Pick files" instead',
  errFilesEmpty: "No files read; please retry or use another browser",
  errIframeBlocker: "Embedded windows cannot open the directory picker: use the link below to open this page in a standalone tab and authorize (once; the embedded window then works automatically)"
};
var STRINGS = { zh, en };

// src/client/fs.ts
var LIST_LIMIT = 1e3;
var DEFAULT_MAX_BYTES = 256 * 1024;
function splitPath(path) {
  const segments = path.split("/").filter((seg) => seg.length > 0 && seg !== ".");
  if (segments.some((seg) => seg === "..")) {
    throw new Error(`path escapes the authorized root: ${path}`);
  }
  return segments;
}
function asString(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}
async function walkDir(root, segments, create) {
  let dir = root;
  for (const segment of segments) {
    dir = await dir.getDirectoryHandle(segment, { create });
  }
  return dir;
}
function describeFsError(path, error) {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return new Error(`no such file or directory: ${path}`);
  }
  return error instanceof Error ? error : new Error(String(error));
}
async function resolveDir(root, path) {
  try {
    return await walkDir(root, splitPath(path), false);
  } catch (error) {
    throw describeFsError(path === "" ? "(root)" : path, error);
  }
}
async function listLevel(dir, limit) {
  const all = [];
  for await (const handle of dir.values()) {
    all.push({ name: handle.name, kind: handle.kind, handle });
  }
  all.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "directory" ? -1 : 1) || a.name.localeCompare(b.name));
  const sliced = all.slice(0, limit);
  const entries = [];
  for (const item of sliced) {
    if (item.kind === "directory") {
      entries.push({ name: item.name, kind: "directory" });
    } else {
      const file = await item.handle.getFile();
      entries.push({ name: item.name, kind: "file", size: file.size });
    }
  }
  return { entries, total: all.length };
}
async function listOp(root, args, signal) {
  const path = asString(args.path, "path") ?? "";
  const recursive = args.recursive === true;
  const segments = splitPath(path);
  const entries = [];
  let truncated = false;
  const walk = async (dir, prefix, depth) => {
    for await (const handle of dir.values()) {
      if (signal.aborted) throw new Error("aborted");
      if (entries.length >= LIST_LIMIT) {
        truncated = true;
        return;
      }
      const childPath = prefix === "" ? handle.name : `${prefix}/${handle.name}`;
      if (handle.kind === "directory") {
        entries.push({ path: childPath, kind: "directory" });
        if (recursive) await walk(handle, childPath, depth + 1);
        if (truncated) return;
      } else {
        const file = await handle.getFile();
        entries.push({ path: childPath, kind: "file", size: file.size });
      }
    }
  };
  let start;
  try {
    start = await walkDir(root, segments, false);
  } catch (error) {
    throw describeFsError(path, error);
  }
  await walk(start, segments.join("/"), 0);
  return { entries, truncated };
}
async function resolveFile(root, path) {
  const segments = splitPath(path);
  const name = segments.pop();
  if (name === void 0) throw new Error("path must name a file, not the root directory");
  try {
    const dir = await walkDir(root, segments, false);
    const fileHandle = await dir.getFileHandle(name);
    return await fileHandle.getFile();
  } catch (error) {
    throw describeFsError(path, error);
  }
}
async function readOp(root, args) {
  const path = asString(args.path, "path");
  if (path === void 0 || path === "") throw new Error("path is required");
  const maxBytes = typeof args.maxBytes === "number" && Number.isFinite(args.maxBytes) && args.maxBytes > 0 ? Math.floor(args.maxBytes) : DEFAULT_MAX_BYTES;
  const file = await resolveFile(root, path);
  const truncated = file.size > maxBytes;
  const blob = truncated ? file.slice(0, maxBytes) : file;
  return { content: await blob.text(), size: file.size, truncated };
}
async function writeOp(root, args, signal) {
  const path = asString(args.path, "path");
  if (path === void 0 || path === "") throw new Error("path is required");
  const content = asString(args.content, "content");
  if (content === void 0) throw new Error("content is required");
  const segments = splitPath(path);
  const name = segments.pop();
  if (name === void 0) throw new Error("path must name a file, not the root directory");
  const dir = await walkDir(root, segments, true);
  const fileHandle = await dir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  if (signal.aborted) {
    await writable.close();
    throw new Error("aborted");
  }
  await writable.write(content);
  await writable.close();
  return { path, bytes: new TextEncoder().encode(content).length };
}
var READ_ONLY_ERROR = "\u517C\u5BB9\u6A21\u5F0F\u53EA\u8BFB\uFF08\u5F53\u524D\u9875\u9762\u975E\u5B89\u5168\u4E0A\u4E0B\u6587\uFF0CFile System Access API \u4E0D\u53EF\u7528\uFF09";
function handleBackend(root) {
  return {
    readOnly: false,
    list: (args, signal) => listOp(root, args, signal),
    read: (args) => readOp(root, args),
    write: (args, signal) => writeOp(root, args, signal),
    listLevel: async (path, limit) => listLevel(await resolveDir(root, path), limit),
    readBlob: (path) => resolveFile(root, path)
  };
}
function executeOp(backend, op, args, signal) {
  if (op === "list") return backend.list(args, signal);
  if (op === "read") return backend.read(args);
  return backend.write(args, signal);
}

// src/client/files-backend.ts
var LIST_LIMIT2 = 1e3;
var DEFAULT_MAX_BYTES2 = 256 * 1024;
function asString2(value, field) {
  if (value === void 0) return void 0;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  return value;
}
function splitPath2(path) {
  const segments = path.split("/").filter((seg) => seg.length > 0 && seg !== ".");
  if (segments.some((seg) => seg === "..")) {
    throw new Error(`path escapes the selected root: ${path}`);
  }
  return segments;
}
function scanLevel(map, path) {
  const prefix = path === "" ? "" : `${path}/`;
  const dirs = /* @__PURE__ */ new Set();
  const files = [];
  for (const [p, file] of map) {
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) files.push({ name: rest, size: file.size });
    else dirs.add(rest.slice(0, slash));
  }
  return { dirs, files };
}
function createFilesBackend(files) {
  const map = /* @__PURE__ */ new Map();
  let dirName = null;
  for (const file of files) {
    const relative = typeof file.webkitRelativePath === "string" && file.webkitRelativePath !== "" ? file.webkitRelativePath : "";
    if (relative === "") {
      map.set(file.name, file);
    } else {
      const segments = relative.split("/");
      dirName ??= segments[0] ?? null;
      map.set(segments.slice(1).join("/"), file);
    }
  }
  for (const key of [...map.keys()]) {
    if (key === "") map.delete(key);
  }
  const displayName = dirName ?? `${String(files.length)} \u4E2A\u6587\u4EF6`;
  const backend = {
    readOnly: true,
    async list(args, signal) {
      const path = asString2(args.path, "path") ?? "";
      splitPath2(path);
      const recursive = args.recursive === true;
      const prefix = path === "" ? "" : `${path}/`;
      const entries = [];
      let truncated = false;
      if (recursive) {
        const dirs = /* @__PURE__ */ new Set();
        const fileEntries = [];
        for (const [p, file] of map) {
          if (signal.aborted) throw new Error("aborted");
          if (!p.startsWith(prefix)) continue;
          const rest = p.slice(prefix.length);
          const parts = rest.split("/");
          for (let i = 1; i < parts.length; i++) dirs.add(prefix + parts.slice(0, i).join("/"));
          fileEntries.push({ path: p, kind: "file", size: file.size });
        }
        const dirEntries = [...dirs].sort().map((p) => ({ path: p, kind: "directory" }));
        for (const entry of [...dirEntries, ...fileEntries]) {
          if (entries.length >= LIST_LIMIT2) {
            truncated = true;
            break;
          }
          entries.push(entry);
        }
      } else {
        const scan = scanLevel(map, path);
        const sortedDirs = [...scan.dirs].sort((a, b) => a.localeCompare(b));
        const sortedFiles = [...scan.files].sort((a, b) => a.name.localeCompare(b.name));
        for (const name of sortedDirs) {
          if (entries.length >= LIST_LIMIT2) {
            truncated = true;
            break;
          }
          entries.push({ path: prefix + name, kind: "directory" });
        }
        if (!truncated) {
          for (const f of sortedFiles) {
            if (entries.length >= LIST_LIMIT2) {
              truncated = true;
              break;
            }
            entries.push({ path: prefix + f.name, kind: "file", size: f.size });
          }
        }
      }
      return { entries, truncated };
    },
    async read(args) {
      const path = asString2(args.path, "path");
      if (path === void 0 || path === "") throw new Error("path is required");
      splitPath2(path);
      const maxBytes = typeof args.maxBytes === "number" && Number.isFinite(args.maxBytes) && args.maxBytes > 0 ? Math.floor(args.maxBytes) : DEFAULT_MAX_BYTES2;
      const file = map.get(path);
      if (file === void 0) throw new Error(`no such file or directory: ${path}`);
      const truncated = file.size > maxBytes;
      const blob = truncated ? file.slice(0, maxBytes) : file;
      return { content: await blob.text(), size: file.size, truncated };
    },
    write() {
      return Promise.reject(new Error(READ_ONLY_ERROR));
    },
    readBlob(path) {
      splitPath2(path);
      const file = map.get(path);
      if (file === void 0) return Promise.reject(new Error(`no such file or directory: ${path}`));
      return Promise.resolve(file);
    },
    listLevel(path, limit) {
      splitPath2(path);
      const { dirs, files: levelFiles } = scanLevel(map, path);
      const sortedDirs = [...dirs].sort((a, b) => a.localeCompare(b));
      const sortedFiles = [...levelFiles].sort((a, b) => a.name.localeCompare(b.name));
      const total = sortedDirs.length + sortedFiles.length;
      const entries = [
        ...sortedDirs.map((name) => ({ name, kind: "directory" })),
        ...sortedFiles.map((f) => ({ name: f.name, kind: "file", size: f.size }))
      ].slice(0, limit);
      return Promise.resolve({ entries, total });
    }
  };
  return { backend, dirName: displayName };
}

// src/client/store.ts
var DB_NAME = "dsh-browser-fs";
var STORE = "handles";
var KEY = "root";
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("indexedDB open failed"));
    };
  });
}
async function withStore(mode, run) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error("indexedDB request failed"));
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error("indexedDB transaction failed"));
      };
    });
  } finally {
    db.close();
  }
}
async function saveHandle(handle) {
  await withStore("readwrite", (store) => store.put(handle, KEY));
}
async function loadHandle() {
  try {
    const value = await withStore("readonly", (store) => store.get(KEY));
    return value instanceof FileSystemDirectoryHandle ? value : null;
  } catch {
    return null;
  }
}
async function clearHandle() {
  await withStore("readwrite", (store) => store.delete(KEY));
}

// src/client/ui.tsx
var import_react = require("react");
var import_react_dom = require("react-dom");

// src/client/panel-fit.ts
var FAB_SIZE = 36;
var PANEL_MARGIN = 10;
function fitPanelToViewport(anchor, panel, viewport) {
  const maxLeft = Math.max(PANEL_MARGIN, viewport.width - PANEL_MARGIN - panel.width);
  const maxTop = Math.max(PANEL_MARGIN, viewport.height - PANEL_MARGIN - panel.height);
  const left = anchor.left + FAB_SIZE / 2 > viewport.width / 2 ? anchor.left + FAB_SIZE - panel.width : anchor.left;
  const top = anchor.top + FAB_SIZE / 2 > viewport.height / 2 ? anchor.top + FAB_SIZE - panel.height : anchor.top;
  return {
    left: Math.min(Math.max(left, PANEL_MARGIN), maxLeft),
    top: Math.min(Math.max(top, PANEL_MARGIN), maxTop)
  };
}

// src/client/preview.ts
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
  "bmp"
]);
var MAX_IMAGE_PREVIEW_BYTES = 8 * 1024 * 1024;
var TEXT_PREVIEW_BYTES = 64 * 1024;
function extensionOf(name) {
  const base = name.split("/").pop() ?? name;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}
function previewKindFor(name) {
  return IMAGE_EXTENSIONS.has(extensionOf(name)) ? "image" : "text";
}
function looksBinary(text) {
  return text.includes("\0");
}
var LANG_BY_EXTENSION = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  c: "c",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  toml: "ini",
  md: "markdown",
  markdown: "markdown",
  html: "xml",
  htm: "xml",
  xml: "xml",
  css: "css",
  sql: "sql"
};
function langFor(name) {
  return LANG_BY_EXTENSION[extensionOf(name)] ?? null;
}
function imageMimeFor(name) {
  switch (extensionOf(name)) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    case "bmp":
      return "image/bmp";
    default:
      return "application/octet-stream";
  }
}

// src/client/ui.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var cardStyle = {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  // 层级调研（2026-08 真机）：shell.overlay 层本身 z-20，better-sidebar 面板
  // fixed z-50/弹件 z-60 会盖住层内任何值——故卡片 portal 到 body 自立层级。
  // 100：压过侧边栏（50/60），远低于 dsh 自身模态/toast（1000/1100）。
  zIndex: 100,
  pointerEvents: "auto",
  minWidth: "240px",
  maxWidth: "340px",
  padding: "10px 12px",
  borderRadius: "10px",
  background: "rgba(32, 33, 36, 0.92)",
  color: "#e8eaed",
  fontSize: "12px",
  lineHeight: 1.5,
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
  fontFamily: "system-ui, sans-serif"
};
var buttonStyle = {
  border: "1px solid rgba(255, 255, 255, 0.25)",
  borderRadius: "6px",
  background: "transparent",
  color: "inherit",
  padding: "3px 10px",
  fontSize: "12px",
  cursor: "pointer"
};
var fabStyle = {
  position: "fixed",
  right: "16px",
  bottom: "16px",
  zIndex: 100,
  pointerEvents: "auto",
  width: "36px",
  height: "36px",
  borderRadius: "50%",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  background: "rgba(32, 33, 36, 0.92)",
  color: "#e8eaed",
  fontSize: "16px",
  cursor: "pointer",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)"
};
function statusColor(state) {
  if (!state.wsConnected) return "#9aa0a6";
  if (state.permission === "granted") return "#34a853";
  if (state.permission === "none") return "#9aa0a6";
  return "#fbbc04";
}
function statusText(state, s) {
  if (!state.wsConnected) return s.statusNoHost;
  switch (state.permission) {
    case "granted":
      return state.compat ? s.statusGrantedCompat(state.dirName ?? "", state.label) : s.statusGranted(state.dirName ?? "", state.label);
    case "prompt":
      return s.statusPrompt;
    case "denied":
      return s.statusDenied;
    case "none": {
      if (state.executors.length > 0) {
        const whom = state.executors.map((executor) => `${executor.label}${executor.dirName === null ? "" : `\uFF08${executor.dirName}\uFF09`}`).join("\u3001");
        return s.statusGrantElsewhere(whom);
      }
      return s.statusNone;
    }
  }
}
function StatusDot({ color }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
    position: "absolute",
    top: "-1px",
    right: "-1px",
    width: "9px",
    height: "9px",
    borderRadius: "50%",
    background: color,
    border: "1.5px solid rgba(32, 33, 36, 0.92)"
  } });
}
var LEVEL_LIMIT = 200;
function humanSize(size) {
  if (size < 1024) return `${String(size)} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
var rowTextStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var highlightModulePromise = null;
function loadHighlighter() {
  highlightModulePromise ??= import(DEFAULT_HIGHLIGHT_PATH);
  return highlightModulePromise;
}
var previewMaskStyle = {
  position: "fixed",
  inset: 0,
  // 预览窗压过卡片/球（100），仍低于 dsh 自身模态（1000）。
  zIndex: 200,
  background: "rgba(0, 0, 0, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};
var previewCardStyle = {
  // 窗口形态：固定尺寸不随内容伸缩；flex 列布局，标题栏钉顶、内容区独立滚动。
  width: "min(720px, 92vw)",
  height: "min(70vh, 560px)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  padding: 0,
  borderRadius: "10px",
  background: "rgba(32, 33, 36, 0.98)",
  color: "#e8eaed",
  fontSize: "12px",
  lineHeight: 1.5,
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.35)",
  fontFamily: "system-ui, sans-serif"
};
function FilePreview({ backend, path, onClose, s }) {
  const [result, setResult] = (0, import_react.useState)({ status: "loading" });
  const name = path.split("/").pop() ?? path;
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    let objectUrl = null;
    void (async () => {
      try {
        const blob = await backend.readBlob(path);
        if (previewKindFor(path) === "image") {
          if (blob.size > MAX_IMAGE_PREVIEW_BYTES) {
            if (!cancelled) setResult({ status: "too-big", size: blob.size });
            return;
          }
          const buffer = await blob.arrayBuffer();
          objectUrl = URL.createObjectURL(new Blob([buffer], { type: imageMimeFor(path) }));
          if (!cancelled) setResult({ status: "image", url: objectUrl, size: blob.size });
        } else {
          const truncated = blob.size > TEXT_PREVIEW_BYTES;
          const text = await (truncated ? blob.slice(0, TEXT_PREVIEW_BYTES) : blob).text();
          if (cancelled) return;
          if (looksBinary(text)) {
            setResult({ status: "binary", size: blob.size });
            return;
          }
          const lang = langFor(path);
          if (lang === null) {
            setResult({ status: "text", text, size: blob.size, truncated });
            return;
          }
          setResult({ status: "text", text, size: blob.size, truncated, highlighting: true });
          try {
            const mod = await loadHighlighter();
            const html = mod.highlightCode(text, lang);
            if (!cancelled) setResult({ status: "code", html, size: blob.size, truncated });
          } catch {
            if (!cancelled) setResult({ status: "text", text, size: blob.size, truncated });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setResult({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [backend, path]);
  (0, import_react.useEffect)(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const meta = (() => {
    switch (result.status) {
      case "image":
      case "too-big":
        return s.metaImage(humanSize(result.size));
      case "text":
      case "code":
        return `${humanSize(result.size)}${result.truncated ? ` \xB7 ${s.metaTruncated}` : ""}`;
      case "binary":
        return humanSize(result.size);
      default:
        return "";
    }
  })();
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: previewMaskStyle, onClick: onClose, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: previewCardStyle, onClick: (event) => {
      event.stopPropagation();
    }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: {
        flexShrink: 0,
        padding: "8px 12px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.12)"
      }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: "6px" }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { style: { ...rowTextStyle, flex: 1, minWidth: 0 }, title: path, children: [
            "\u{1F4C4} ",
            name
          ] }),
          meta !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.6, fontSize: "11px", whiteSpace: "nowrap", flexShrink: 0 }, children: meta }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              style: { ...buttonStyle, padding: "0 7px", lineHeight: 1.2, flexShrink: 0 },
              onClick: onClose,
              title: s.closeTip,
              children: "\u2715"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { ...rowTextStyle, opacity: 0.6, fontFamily: "monospace", fontSize: "11px" }, title: path, children: path })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { flex: 1, minHeight: 0, overflow: "auto", padding: "10px 12px" }, children: [
        result.status === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.6 }, children: s.loading }),
        result.status === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { color: "#f28b82" }, children: result.message }),
        result.status === "too-big" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.85 }, children: s.tooBig(humanSize(result.size)) }),
        result.status === "binary" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { opacity: 0.85 }, children: s.binary(humanSize(result.size)) }),
        result.status === "image" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", { src: result.url, alt: name, style: { maxWidth: "100%", borderRadius: "6px" } }),
        result.status === "text" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          result.highlighting === true && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6, marginBottom: "4px" }, children: s.hlLoading }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { style: {
            margin: 0,
            fontFamily: "monospace",
            fontSize: "11px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all"
          }, children: result.text })
        ] }),
        result.status === "code" && // hljs 输出已转义（& < >），可安全注入。
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "pre",
          {
            className: "hljs",
            style: {
              margin: 0,
              fontFamily: "monospace",
              fontSize: "11px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all"
            },
            children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("code", { dangerouslySetInnerHTML: { __html: result.html } })
          }
        )
      ] })
    ] }) }),
    document.body
  );
}
function DirTree({ backend, apiRef, s }) {
  const [open, setOpen] = (0, import_react.useState)(false);
  const [expanded, setExpanded] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [levels, setLevels] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [loading, setLoading] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [errors, setErrors] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [copied, setCopied] = (0, import_react.useState)(null);
  const [preview, setPreview] = (0, import_react.useState)(null);
  const refresh = () => {
    setExpanded(/* @__PURE__ */ new Set());
    setLevels(/* @__PURE__ */ new Map());
    setErrors(/* @__PURE__ */ new Map());
    setCopied(null);
    if (open) void loadLevel("");
  };
  (0, import_react.useEffect)(() => {
    apiRef.current = { refresh };
    return () => {
      apiRef.current = null;
    };
  });
  const loadLevel = async (dirPath) => {
    setLoading((prev) => new Set(prev).add(dirPath));
    try {
      const { entries, total } = await backend.listLevel(dirPath, LEVEL_LIMIT);
      const nodes = entries.map((entry) => ({
        ...entry,
        path: dirPath === "" ? entry.name : `${dirPath}/${entry.name}`
      }));
      setLevels((prev) => new Map(prev).set(dirPath, { entries: nodes, total }));
      setErrors((prev) => {
        const next = new Map(prev);
        next.delete(dirPath);
        return next;
      });
    } catch (error) {
      setErrors((prev) => new Map(prev).set(dirPath, error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  };
  const toggleSection = () => {
    if (!open && !levels.has("") && !loading.has("")) void loadLevel("");
    setOpen(!open);
  };
  const toggleDir = (path) => {
    if (expanded.has(path)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      setLevels((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
    } else {
      setExpanded((prev) => new Set(prev).add(path));
      void loadLevel(path);
    }
  };
  const copyPath = (path) => {
    void navigator.clipboard?.writeText(path).then(() => {
      setCopied(path);
      setTimeout(() => {
        setCopied((prev) => prev === path ? null : prev);
      }, 1200);
    }).catch(() => {
    });
  };
  const renderLevel = (dirPath, depth) => {
    const level = levels.get(dirPath);
    if (level === void 0) return [];
    const rows = [];
    for (const entry of level.entries) {
      rows.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: "4px",
          paddingLeft: `${String(depth * 12)}px`,
          paddingTop: "1px",
          paddingBottom: "1px"
        }, children: entry.kind === "directory" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "span",
          {
            style: { ...rowTextStyle, cursor: "pointer", flex: 1 },
            onClick: () => {
              toggleDir(entry.path);
            },
            title: entry.path,
            children: [
              expanded.has(entry.path) ? "\u25BE" : "\u25B8",
              " \u{1F4C1} ",
              entry.name
            ]
          }
        ) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "span",
            {
              style: { ...rowTextStyle, flex: 1, cursor: "pointer", color: "#8ab4f8" },
              title: s.previewTip(entry.path),
              onClick: () => {
                setPreview(entry.path);
              },
              children: [
                "\u{1F4C4} ",
                entry.name,
                entry.size !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { opacity: 0.55 }, children: [
                  " ",
                  humanSize(entry.size)
                ] })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              style: { ...buttonStyle, padding: "0 5px", fontSize: "10px", flexShrink: 0 },
              title: s.copyPathTip(entry.path),
              onClick: () => {
                copyPath(entry.path);
              },
              children: copied === entry.path ? "\u2713" : s.copyPath
            }
          )
        ] }) }, entry.path)
      );
      if (entry.kind === "directory" && expanded.has(entry.path)) {
        if (loading.has(entry.path) && !levels.has(entry.path)) {
          rows.push(
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { paddingLeft: `${String((depth + 1) * 12)}px`, opacity: 0.6 }, children: s.loading }, `${entry.path}~loading`)
          );
        }
        const error = errors.get(entry.path);
        if (error !== void 0) {
          rows.push(
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { paddingLeft: `${String((depth + 1) * 12)}px`, color: "#f28b82" }, children: error }, `${entry.path}~error`)
          );
        }
        rows.push(...renderLevel(entry.path, depth + 1));
      }
    }
    const rest = level.total - level.entries.length;
    if (rest > 0) {
      rows.push(
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { paddingLeft: `${String(depth * 12)}px`, opacity: 0.6 }, children: s.moreItems(rest) }, `${dirPath}~more`)
      );
    }
    return rows;
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.12)", paddingTop: "6px" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { cursor: "pointer", userSelect: "none" }, onClick: toggleSection, children: [
      open ? "\u25BE" : "\u25B8",
      " ",
      s.treeSection
    ] }),
    open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { maxHeight: "240px", overflowY: "auto", marginTop: "4px" }, children: [
      loading.has("") && !levels.has("") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { opacity: 0.6 }, children: s.loading }),
      errors.has("") && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: "#f28b82" }, children: errors.get("") }),
      renderLevel("", 0)
    ] }),
    preview !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FilePreview, { backend, path: preview, onClose: () => {
      setPreview(null);
    }, s })
  ] });
}
var CARD_POS_KEY = "dsh-browser-fs:card-pos";
var DRAG_THRESHOLD_PX = 4;
function readStoredCardPos() {
  try {
    const raw = localStorage.getItem(CARD_POS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { left, top } = parsed;
    if (typeof left !== "number" || typeof top !== "number") return null;
    if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
    return { left, top };
  } catch {
    return null;
  }
}
function clampAnchorToViewport(pos) {
  return {
    left: Math.min(Math.max(pos.left, 0), window.innerWidth - FAB_SIZE),
    top: Math.min(Math.max(pos.top, 0), window.innerHeight - FAB_SIZE)
  };
}
function createCard(source) {
  const treeApi = { current: null };
  return function BrowserFsCard() {
    const state = (0, import_react.useSyncExternalStore)(source.subscribe, source.getSnapshot);
    const { actions } = source;
    const s = STRINGS[state.lang];
    const [editingName, setEditingName] = (0, import_react.useState)(false);
    const [draftName, setDraftName] = (0, import_react.useState)("");
    const [pos, setPos] = (0, import_react.useState)(readStoredCardPos);
    const cardRef = (0, import_react.useRef)(null);
    const fabRef = (0, import_react.useRef)(null);
    const dragRef = (0, import_react.useRef)(null);
    const dragCleanupRef = (0, import_react.useRef)(null);
    const [dragging, setDragging] = (0, import_react.useState)(false);
    const [panelFit, setPanelFit] = (0, import_react.useState)(null);
    (0, import_react.useEffect)(() => {
      const clampIntoView = () => {
        setPos((prev) => prev === null ? prev : clampAnchorToViewport(prev));
        setPanelFit(null);
      };
      clampIntoView();
      window.addEventListener("resize", clampIntoView);
      return () => {
        window.removeEventListener("resize", clampIntoView);
      };
    }, []);
    (0, import_react.useEffect)(() => () => {
      dragCleanupRef.current?.();
    }, []);
    (0, import_react.useLayoutEffect)(() => {
      if (state.collapsed || dragRef.current !== null) return;
      const card = cardRef.current;
      if (card === null) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const anchor = pos ?? { left: vw - 16 - FAB_SIZE, top: vh - 16 - FAB_SIZE };
      const target = fitPanelToViewport(
        anchor,
        { width: card.offsetWidth, height: card.offsetHeight },
        { width: vw, height: vh }
      );
      setPanelFit((prev) => prev !== null && prev.left === target.left && prev.top === target.top ? prev : target);
    });
    const onHandlePointerDown = (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const el = cardRef.current ?? fabRef.current;
      if (el === null) return;
      const rect = el.getBoundingClientRect();
      const drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseLeft: rect.left,
        baseTop: rect.top,
        moved: false
      };
      dragRef.current = drag;
      const onMove = (e) => {
        if (e.pointerId !== drag.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (!drag.moved) {
          if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return;
          drag.moved = true;
          setDragging(true);
        }
        setPos({ left: drag.baseLeft + dx, top: drag.baseTop + dy });
      };
      const onUp = (e) => {
        if (e.pointerId !== drag.pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        dragCleanupRef.current = null;
        dragRef.current = null;
        setDragging(false);
        if (!drag.moved) return;
        const swallow = (clickEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          window.removeEventListener("click", swallow, true);
        };
        window.addEventListener("click", swallow, true);
        setTimeout(() => {
          window.removeEventListener("click", swallow, true);
        }, 500);
        setPos((prev) => {
          const clamped = clampAnchorToViewport(prev ?? { left: drag.baseLeft, top: drag.baseTop });
          try {
            localStorage.setItem(CARD_POS_KEY, JSON.stringify(clamped));
          } catch {
          }
          return clamped;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      dragCleanupRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
    };
    if (state.collapsed) {
      if (panelFit !== null) setPanelFit(null);
      const appliedFabStyle = pos === null ? fabStyle : { ...fabStyle, right: "auto", bottom: "auto", left: `${String(pos.left)}px`, top: `${String(pos.top)}px` };
      return (0, import_react_dom.createPortal)(
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            ref: fabRef,
            style: { ...appliedFabStyle, touchAction: "none", userSelect: "none" },
            title: s.fabTip,
            onClick: () => {
              actions.toggleCollapsed();
            },
            onPointerDown: onHandlePointerDown,
            children: [
              "\u{1F4C1}",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, { color: statusColor(state) })
            ]
          }
        ),
        document.body
      );
    }
    const saveName = () => {
      actions.setDeviceName(draftName);
      setEditingName(false);
    };
    const appliedCardStyle = (() => {
      const capped = {
        ...cardStyle,
        maxWidth: "min(340px, calc(100vw - 20px))",
        maxHeight: "calc(100vh - 20px)",
        overflowY: "auto"
      };
      const at = dragging ? pos : panelFit ?? pos;
      if (at === null) return capped;
      return { ...capped, right: "auto", bottom: "auto", left: `${String(at.left)}px`, top: `${String(at.top)}px` };
    })();
    return (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "div",
        {
          ref: cardRef,
          style: appliedCardStyle,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "6px",
                  cursor: "grab",
                  touchAction: "none",
                  userSelect: "none"
                },
                title: s.handleTip,
                onPointerDown: onHandlePointerDown,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: statusColor(state),
                    flexShrink: 0
                  } }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { style: { flex: 1 }, children: s.cardTitle }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                    "button",
                    {
                      style: { ...buttonStyle, padding: "0 7px", lineHeight: 1.2 },
                      onClick: () => {
                        actions.toggleCollapsed();
                      },
                      title: s.collapseTip,
                      children: "\u2014"
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginBottom: "4px", opacity: 0.9 }, children: statusText(state, s) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", alignItems: "center", gap: "4px", marginBottom: "8px", opacity: 0.85 }, children: editingName ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                autoFocus: true,
                value: draftName,
                placeholder: s.namePlaceholder,
                style: {
                  flex: 1,
                  minWidth: 0,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: "6px",
                  color: "inherit",
                  fontSize: "12px",
                  padding: "2px 6px"
                },
                onChange: (event) => {
                  setDraftName(event.target.value);
                },
                onKeyDown: (event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") setEditingName(false);
                },
                onBlur: saveName
              }
            ) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { ...rowTextStyle, flex: 1 }, title: state.label, children: s.localLabel(state.label) }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  style: { ...buttonStyle, padding: "0 5px", fontSize: "10px", flexShrink: 0 },
                  title: s.editNameTip,
                  onClick: () => {
                    setDraftName(state.nickname ?? "");
                    setEditingName(true);
                  },
                  children: "\u270F\uFE0F"
                }
              )
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" }, children: state.permission === "granted" ? state.compat ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.pickCompatDir();
              }, children: s.reselectDir }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.pickCompatFiles();
              }, children: s.reselectFiles }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.revoke();
              }, children: s.clear }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  style: buttonStyle,
                  disabled: state.busy,
                  title: s.refreshTipCompat,
                  onClick: () => {
                    actions.pickCompatRefresh();
                  },
                  children: "\u21BB"
                }
              )
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.pickNew();
              }, children: s.pickNew }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.revoke();
              }, children: s.revoke }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, title: s.refreshTipFull, onClick: () => {
                treeApi.current?.refresh();
              }, children: "\u21BB" })
            ] }) : state.pickerAvailable ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.authorize();
              }, children: state.permission === "none" ? s.authorize : s.reauthorize }),
              state.permission !== "none" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.pickNew();
              }, children: s.pickNew })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.pickCompatDir();
              }, children: s.compatDir }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { style: buttonStyle, disabled: state.busy, onClick: () => {
                actions.pickCompatFiles();
              }, children: s.compatFiles })
            ] }) }),
            !state.pickerAvailable && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.12)", paddingTop: "6px", opacity: 0.85 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: {
                display: "inline-block",
                padding: "0 6px",
                borderRadius: "4px",
                background: "rgba(251, 188, 4, 0.25)",
                color: "#fbbc04",
                fontSize: "10px",
                marginBottom: "4px"
              }, children: s.compatBadge }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: s.compatDesc }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { marginTop: "4px" }, children: [
                s.compatHowtoFull,
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: "2px", fontFamily: "monospace", fontSize: "11px", opacity: 0.9 }, children: s.compatSsh }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontFamily: "monospace", fontSize: "11px", opacity: 0.9 }, children: s.compatFlag }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { fontFamily: "monospace", fontSize: "11px", opacity: 0.9 }, children: s.compatHttps })
              ] })
            ] }),
            state.permission === "granted" && state.backend !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DirTree, { backend: state.backend, apiRef: treeApi, s }, state.rootVersion),
            state.error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: "6px", color: "#f28b82" }, children: state.error }),
            state.error !== null && window.self !== window.top && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { marginTop: "6px" }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", { href: location.origin, target: "_blank", rel: "noreferrer", style: { color: "#8ab4f8" }, children: s.iframeAuthLink }) })
          ]
        }
      ),
      document.body
    );
  };
}

// src/client/index.ts
var inject = ["slots"];
function apply(ctx) {
  const COLLAPSED_KEY = "dsh-browser-fs:collapsed";
  const storedCollapsed = (() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw === null ? null : raw === "1";
    } catch {
      return null;
    }
  })();
  let collapseTouched = storedCollapsed !== null;
  const storedNickname = (() => {
    try {
      const raw = localStorage.getItem("dsh-browser-fs:device-name");
      return raw === null || raw.trim() === "" ? null : raw;
    } catch {
      return null;
    }
  })();
  const derivedLabel = deriveDeviceLabel(navigator.userAgent);
  const pickerAvailable = typeof window.showDirectoryPicker === "function";
  console.log("[browser-fs] init: showDirectoryPicker", pickerAvailable ? "\u53EF\u7528\uFF08\u5B8C\u6574\u6A21\u5F0F\uFF09" : "\u4E0D\u53EF\u7528\uFF08\u517C\u5BB9\u6A21\u5F0F\uFF09", "| UA:", navigator.userAgent);
  let state = {
    wsConnected: false,
    permission: "none",
    dirName: null,
    busy: false,
    error: null,
    collapsed: storedCollapsed ?? false,
    backend: null,
    rootVersion: 0,
    label: storedNickname ?? derivedLabel,
    nickname: storedNickname,
    executors: [],
    pickerAvailable,
    compat: false,
    lang: detectLang()
  };
  const listeners = /* @__PURE__ */ new Set();
  const setState = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  let handle = null;
  let backend = null;
  let rootVersion = 0;
  const setHandle = (next) => {
    handle = next;
    backend = next === null ? null : handleBackend(next);
    rootVersion += 1;
    setState({ backend, rootVersion, compat: false });
  };
  const setCompatBackend = (files) => {
    const built = createFilesBackend(files);
    handle = null;
    backend = built.backend;
    rootVersion += 1;
    setState({ backend, rootVersion, compat: true, dirName: built.dirName, permission: "granted", error: null });
  };
  let ws = null;
  let disposed = false;
  let retryMs = 1e3;
  let retryTimer;
  const inflight = /* @__PURE__ */ new Map();
  const ready = () => backend !== null && state.permission === "granted";
  const sendState = () => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "state",
        hasHandle: ready(),
        dirName: ready() ? state.dirName : null,
        label: state.label
      }));
    }
  };
  const reply = (frame) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  };
  const onCall = async (rpcId, op, args) => {
    if (backend === null || !ready()) {
      reply({ type: "result", rpcId, ok: false, error: "browser-fs: this tab holds no authorized directory" });
      return;
    }
    const abort = new AbortController();
    inflight.set(rpcId, abort);
    try {
      const value = await executeOp(backend, op, args, abort.signal);
      reply({ type: "result", rpcId, ok: true, value });
    } catch (error) {
      reply({
        type: "result",
        rpcId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      inflight.delete(rpcId);
    }
  };
  const onMessage = (raw) => {
    const frame = parseHostFrame(raw);
    if (frame === null) return;
    if (frame.type === "roster") {
      setState({ executors: [...frame.executors] });
      return;
    }
    if (frame.type === "cancel") {
      inflight.get(frame.rpcId)?.abort();
      return;
    }
    void onCall(frame.rpcId, frame.op, frame.args);
  };
  const connect = () => {
    if (disposed) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${scheme}://${location.host}${DEFAULT_WS_PATH}`);
    ws = sock;
    sock.onopen = () => {
      retryMs = 1e3;
      setState({ wsConnected: true });
      sendState();
    };
    sock.onmessage = (event) => {
      if (typeof event.data === "string") onMessage(event.data);
    };
    sock.onclose = () => {
      if (ws === sock) {
        ws = null;
        setState({ wsConnected: false, executors: [] });
      }
      if (!disposed) retryTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 1e4);
    };
    sock.onerror = () => {
      sock.close();
    };
  };
  const restore = async () => {
    if (!pickerAvailable) return;
    const stored = await loadHandle();
    if (stored === null) {
      setState({ permission: "none", dirName: null });
      return;
    }
    setHandle(stored);
    const permission = await stored.queryPermission({ mode: "readwrite" });
    if (!collapseTouched) setState({ collapsed: true });
    setState({ permission, dirName: stored.name });
    sendState();
  };
  const envBlocker = () => {
    if (window.self !== window.top) {
      return STRINGS[state.lang].errIframeBlocker;
    }
    return null;
  };
  let compatInput = null;
  let compatDirPickBroken = false;
  let compatPickMode = "directory";
  const openCompatPicker = (mode) => {
    console.log("[browser-fs] openCompatPicker, mode =", mode);
    if (compatInput === null) {
      const input = document.createElement("input");
      input.type = "file";
      Object.assign(input.style, {
        position: "fixed",
        left: "-9999px",
        top: "0",
        width: "1px",
        height: "1px",
        opacity: "0"
      });
      input.addEventListener("change", () => {
        const files = input.files;
        console.log("[browser-fs] change: files =", files?.length ?? 0, ", webkitdirectory =", input.webkitdirectory);
        const outcome = classifyCompatChange(files?.length ?? 0, input.webkitdirectory);
        if (outcome.kind === "selected" && files !== null) {
          compatPickMode = outcome.directory ? "directory" : "files";
          setCompatBackend([...files]);
          sendState();
          return;
        }
        if (outcome.kind === "dir-empty") {
          compatDirPickBroken = true;
          setState({ error: STRINGS[state.lang].errDirEmpty });
        } else {
          setState({ error: STRINGS[state.lang].errFilesEmpty });
        }
      });
      document.body.appendChild(input);
      compatInput = input;
    }
    const probe = compatInput;
    const shape = resolveCompatInput(mode, {
      dirSupported: "webkitdirectory" in probe,
      dirBroken: compatDirPickBroken
    });
    compatInput.webkitdirectory = shape.directory;
    compatInput.multiple = true;
    compatInput.value = "";
    console.log("[browser-fs] input.click() \u89E6\u53D1\u9009\u62E9\u5668, directory =", shape.directory);
    compatInput.click();
  };
  const isMobileLike = /Android|HarmonyOS|iPhone|iPad/i.test(navigator.userAgent);
  const runFullModePicker = async (reuse) => {
    const blocker = envBlocker();
    if (blocker !== null) {
      setState({ error: blocker });
      return;
    }
    setState({ busy: true, error: null });
    try {
      if (reuse && handle !== null) {
        const permission = await handle.requestPermission({ mode: "readwrite" });
        setState({ permission, dirName: handle.name });
      } else {
        console.log("[browser-fs] showDirectoryPicker \u8C03\u7528");
        const picked = await showDirectoryPicker({ mode: "readwrite" });
        console.log("[browser-fs] \u76EE\u5F55\u5DF2\u9009:", picked.name);
        setHandle(picked);
        await saveHandle(picked);
        setState({ permission: "granted", dirName: picked.name });
      }
      sendState();
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "Error";
      console.log("[browser-fs] showDirectoryPicker \u5931\u8D25:", name, error instanceof Error ? error.message : "");
      if (isMobileLike) {
        setState({ error: "\u5F53\u524D\u6D4F\u89C8\u5668\u7684\u76EE\u5F55\u9009\u62E9\u5668\u4E0D\u53EF\u7528\uFF0C\u5DF2\u5207\u6362\u517C\u5BB9\u6A21\u5F0F" });
        openCompatPicker("directory");
      } else if (!(error instanceof DOMException && error.name === "AbortError")) {
        setState({ error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      setState({ busy: false });
    }
  };
  const actions = {
    authorize() {
      if (!pickerAvailable) {
        openCompatPicker("directory");
        return;
      }
      void runFullModePicker(true);
    },
    pickNew() {
      if (!pickerAvailable) {
        openCompatPicker("directory");
        return;
      }
      void runFullModePicker(false);
    },
    revoke() {
      void (async () => {
        setHandle(null);
        backend = null;
        setState({ backend: null });
        if (pickerAvailable) await clearHandle();
        setState({ permission: "none", dirName: null, error: null, compat: false });
        sendState();
      })();
    },
    /** 收起/展开卡片；显式选择写 localStorage，此后不再随权限状态改默认值。 */
    toggleCollapsed() {
      const collapsed = !state.collapsed;
      collapseTouched = true;
      try {
        localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
      } catch {
      }
      setState({ collapsed });
    },
    /** 设置设备昵称（空串清除昵称，回落到 UA 派生标签）；写 localStorage 并重新广播 state。 */
    setDeviceName(name) {
      const trimmed = name.trim();
      const nickname = trimmed === "" ? null : trimmed;
      try {
        if (nickname === null) localStorage.removeItem("dsh-browser-fs:device-name");
        else localStorage.setItem("dsh-browser-fs:device-name", nickname);
      } catch {
      }
      setState({ nickname, label: nickname ?? derivedLabel });
      sendState();
    },
    /** 兼容模式：选目录（webkitdirectory；有失效前科时自动退多选）。 */
    pickCompatDir() {
      openCompatPicker("directory");
    },
    /** 兼容模式：多选文件（multiple）。 */
    pickCompatFiles() {
      openCompatPicker("files");
    },
    /** 兼容模式 ↻ 刷新：按上次成功选择的形态重开选择器。 */
    pickCompatRefresh() {
      openCompatPicker(compatPickMode);
    }
  };
  const card = createCard({
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    actions
  });
  ctx.effect(() => {
    connect();
    void restore();
    return () => {
      disposed = true;
      if (retryTimer !== void 0) clearTimeout(retryTimer);
      ws?.close();
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
      compatInput?.remove();
      compatInput = null;
    };
  }, "browser-fs: websocket lifecycle");
  ctx.effect(
    () => subscribeLang(() => {
      setState({ lang: detectLang() });
    }),
    "browser-fs: lang follow"
  );
  ctx.effect(() => {
    let dispose;
    ctx.slots.inject("shell.overlay", () => {
      dispose = ctx.slots.register(
        { name: "shell.overlay", id: "browser-fs", order: 100, label: "\u6D4F\u89C8\u5668\u6587\u4EF6" },
        card
      );
      return dispose;
    });
    return () => {
      dispose?.();
    };
  }, "browser-fs: overlay card");
}
return module.exports; } });

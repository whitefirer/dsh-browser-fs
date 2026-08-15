// src/index.ts
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import WebSocket, { WebSocketServer } from "ws";
import { defineTool } from "@deepseek-ai/dsh-tools";

// src/wire.ts
var DEFAULT_WS_PATH = "/browser-fs/ws";
function highlightModulePath(wsPath) {
  const slash = wsPath.lastIndexOf("/");
  return `${slash <= 0 ? "" : wsPath.slice(0, slash)}/highlight.mjs`;
}
var DEFAULT_HIGHLIGHT_PATH = highlightModulePath(DEFAULT_WS_PATH);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseBrowserFrame(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  if (value.type === "result" && typeof value.rpcId === "string" && typeof value.ok === "boolean") {
    return {
      type: "result",
      rpcId: value.rpcId,
      ok: value.ok,
      ...value.value !== void 0 ? { value: value.value } : {},
      ...typeof value.error === "string" ? { error: value.error } : {}
    };
  }
  if (value.type === "state" && typeof value.hasHandle === "boolean") {
    return {
      type: "state",
      hasHandle: value.hasHandle,
      dirName: typeof value.dirName === "string" ? value.dirName : null,
      label: typeof value.label === "string" ? value.label : ""
    };
  }
  return null;
}

// src/index.ts
var name = "browser-fs";
var inject = ["webServer", "tools"];
function isSameOrigin(req) {
  const host = req.headers.host;
  if (typeof host !== "string" || host.length === 0) return false;
  const origin = req.headers.origin;
  if (typeof origin !== "string") return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
function rejectWebSocketUpgrade(socket) {
  socket.end([
    "HTTP/1.1 403 Forbidden",
    "Connection: close",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Length: 9",
    "",
    "forbidden"
  ].join("\r\n"));
}
var BrowserRelay = class {
  /**
   * @param requestTimeoutMs - 单次调用的超时预算。
   */
  constructor(requestTimeoutMs) {
    this.requestTimeoutMs = requestTimeoutMs;
  }
  server = new WebSocketServer({ noServer: true });
  conns = /* @__PURE__ */ new Set();
  pending = /* @__PURE__ */ new Map();
  /**
   * 升级一条 socket 并登记标签页连接。
   * @param req - HTTP upgrade 请求（已过同源栅栏）。
   * @param socket - HTTP 服务器移交的裸 socket。
   * @param head - upgrade 头之后已读的字节。
   */
  handleUpgrade(req, socket, head) {
    this.server.handleUpgrade(req, socket, head, (ws) => {
      this.accept(ws);
    });
  }
  /**
   * 挑选一个持有授权句柄的标签页，发起一次调用并等待结果。
   * @param op - 文件操作。
   * @param args - 操作参数。
   * @param signal - 调用方（工具 registry）的取消信号。
   * @returns 浏览器端回传的 JSON 值 + 执行者设备标签。
   */
  call(op, args, signal) {
    const conn = this.pickExecutor();
    if (conn === void 0) {
      if (this.conns.size === 0) {
        return Promise.reject(new Error(
          "browser-fs: dsh \u9875\u9762\u672A\u5728\u4EFB\u4F55\u8BBE\u5907\u6253\u5F00\uFF08\u8FD9\u4E9B\u5DE5\u5177\u64CD\u4F5C\u7684\u662F\u6D4F\u89C8\u5668\u6240\u5728\u673A\u5668\u7684\u672C\u5730\u6587\u4EF6\uFF0C\u9700\u8981\u4E00\u4E2A\u5728\u7EBF\u6807\u7B7E\u9875\uFF09"
        ));
      }
      return Promise.reject(new Error(
        "browser-fs: \u6CA1\u6709\u8BBE\u5907\u6301\u6709\u6388\u6743\u76EE\u5F55\uFF08\u8BF7\u5728 dsh \u9875\u9762\u7684 browser-fs \u5361\u7247\u91CC\u6388\u6743\uFF09"
      ));
    }
    const device = conn.label === "" ? "\u672A\u547D\u540D\u8BBE\u5907" : conn.label;
    const rpcId = randomUUID();
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        if (this.settle(rpcId) === void 0) return;
        try {
          this.send(conn, { type: "cancel", rpcId });
        } catch {
        }
        reject(new Error("browser-fs: call aborted by caller"));
      };
      const timer = setTimeout(() => {
        if (this.settle(rpcId) === void 0) return;
        reject(new Error(`browser-fs: \u8BBE\u5907\u300C${device}\u300D\u672A\u5728 ${String(this.requestTimeoutMs)}ms \u5185\u54CD\u5E94`));
      }, this.requestTimeoutMs);
      this.pending.set(rpcId, { conn, signal, onAbort, resolve, reject, timer });
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
      try {
        this.send(conn, { type: "call", rpcId, op, args });
      } catch (error) {
        if (this.settle(rpcId) !== void 0) reject(error instanceof Error ? error : new Error(String(error)));
      }
    }).then((value) => ({ value, device }));
  }
  /** 取出并清理一次挂起调用（计时器 + abort 监听）；已完结返回 undefined。 */
  settle(rpcId) {
    const entry = this.pending.get(rpcId);
    if (entry === void 0) return void 0;
    this.pending.delete(rpcId);
    clearTimeout(entry.timer);
    entry.signal.removeEventListener("abort", entry.onAbort);
    return entry;
  }
  /** 终止全部连接并拒掉所有挂起调用（插件 dispose 时调用）。 */
  async close() {
    for (const conn of this.conns) conn.ws.terminate();
    for (const rpcId of [...this.pending.keys()]) {
      this.settle(rpcId)?.reject(new Error("browser-fs: plugin disposed"));
    }
    await new Promise((resolve) => {
      this.server.close(() => {
        resolve();
      });
      setImmediate(resolve);
    });
  }
  accept(ws) {
    const conn = { id: randomUUID(), ws, hasHandle: false, dirName: null, label: "" };
    this.conns.add(conn);
    this.sendRoster(conn);
    ws.on("message", (data) => {
      const frame = parseBrowserFrame(data.toString());
      if (frame === null) return;
      if (frame.type === "state") {
        conn.hasHandle = frame.hasHandle;
        conn.dirName = frame.dirName;
        conn.label = frame.label;
        this.broadcastRoster();
        return;
      }
      const entry = this.settle(frame.rpcId);
      if (entry === void 0 || entry.conn !== conn) return;
      const device = conn.label === "" ? "\u672A\u547D\u540D\u8BBE\u5907" : conn.label;
      if (frame.ok) entry.resolve(frame.value);
      else entry.reject(new Error(`${frame.error ?? "browser-fs: browser-side call failed"}\uFF08\u8BBE\u5907\uFF1A${device}\uFF09`));
    });
    const drop = () => {
      this.conns.delete(conn);
      for (const rpcId of [...this.pending.keys()]) {
        const entry = this.pending.get(rpcId);
        if (entry === void 0 || entry.conn !== conn) continue;
        const device = conn.label === "" ? "\u672A\u547D\u540D\u8BBE\u5907" : conn.label;
        this.settle(rpcId)?.reject(new Error(`browser-fs: \u8BBE\u5907\u300C${device}\u300D\u7684\u6807\u7B7E\u9875\u5728\u8C03\u7528\u4E2D\u9014\u65AD\u5F00`));
      }
      this.broadcastRoster();
    };
    ws.once("close", drop);
    ws.once("error", drop);
  }
  /** 组装当前执行者名单（仅 hasHandle=true 的连接进 executors）。 */
  rosterFrame() {
    const executors = [...this.conns].filter((conn) => conn.hasHandle).map((conn) => ({ label: conn.label === "" ? "\u672A\u547D\u540D\u8BBE\u5907" : conn.label, dirName: conn.dirName }));
    return JSON.stringify({ type: "roster", executors });
  }
  /** 向全部在线连接广播 roster（任一连接 state 变化/断连时调用）。 */
  broadcastRoster() {
    const raw = this.rosterFrame();
    for (const conn of this.conns) {
      if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(raw);
    }
  }
  /** 向单条连接发送 roster（新连接接入时的初始名单）。 */
  sendRoster(conn) {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.send(this.rosterFrame());
  }
  /**
   * Set 迭代序即插入序：取第一个声明 hasHandle 的连接 —— 多台设备同时
   * 持柄在线时执行者确定（先接入者先得），不会逐次调用漂移。
   */
  pickExecutor() {
    for (const conn of this.conns) {
      if (conn.hasHandle) return conn;
    }
    return void 0;
  }
  send(conn, frame) {
    if (conn.ws.readyState !== WebSocket.OPEN) {
      throw new Error("browser-fs: browser tab websocket is not open");
    }
    conn.ws.send(JSON.stringify(frame), (error) => {
      if (error != null) conn.ws.terminate();
    });
  }
};
var NOT_HOST_FS = " This operates on the local disk of the machine running the browser (authorized via File System Access API), NOT on this host's filesystem.";
function text(text2) {
  return [{ type: "text", text: text2 }];
}
function apply(ctx, config) {
  const wsPath = typeof config?.wsPath === "string" && config.wsPath.length > 0 ? config.wsPath : DEFAULT_WS_PATH;
  const requestTimeoutMs = typeof config?.requestTimeoutMs === "number" && Number.isFinite(config.requestTimeoutMs) && config.requestTimeoutMs > 0 ? config.requestTimeoutMs : 12e4;
  const relay = new BrowserRelay(requestTimeoutMs);
  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: wsPath,
    handler: (req, socket, head) => {
      if (!isSameOrigin(req)) {
        rejectWebSocketUpgrade(socket);
        return;
      }
      relay.handleUpgrade(req, socket, head);
    }
  }), "browser-fs: ws upgrade route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: wsPath,
    handler: (_req, res) => {
      res.writeHead(426, { connection: "Upgrade", upgrade: "websocket" });
      res.end("upgrade required");
    }
  }), "browser-fs: ws probe route");
  let highlightBody = null;
  try {
    highlightBody = readFileSync(new URL("./highlight.mjs", import.meta.url));
  } catch {
    highlightBody = null;
  }
  if (highlightBody !== null) {
    const body = highlightBody;
    ctx.effect(() => ctx.webServer.register({
      kind: "exact",
      path: highlightModulePath(wsPath),
      handler: (_req, res) => {
        res.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-cache"
        });
        res.end(body);
      }
    }), "browser-fs: highlight module route");
  }
  ctx.effect(() => () => relay.close(), "browser-fs: relay teardown");
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "browser_fs_list",
    description: "List files and directories inside the local directory the user authorized in the dsh web page." + NOT_HOST_FS + " `path` is relative to the authorized root (omit for the root itself). Set `recursive` to true to walk subdirectories. Requires a connected browser tab holding an authorized directory; fails fast otherwise.",
    parameters: {
      path: { type: "string", description: "Directory path relative to the authorized root; omit for the root." },
      recursive: { type: "boolean", description: "Walk subdirectories depth-first when true (default false)." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          entries: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                path: { type: "string", required: true },
                kind: { type: "string", required: true, enum: ["file", "directory"] },
                size: { type: "integer" }
              }
            }
          },
          truncated: { type: "boolean", required: true },
          device: { type: "string", required: true }
        }
      },
      render: (args, value) => {
        const base = args.path === void 0 || args.path === "" ? "(root)" : args.path;
        const lines = value.entries.map((entry) => entry.kind === "directory" ? `${entry.path}/` : `${entry.path}${entry.size === void 0 ? "" : ` (${String(entry.size)} B)`}`);
        const head = `${base} \u5171 ${String(value.entries.length)} \u6761\uFF08\u8BBE\u5907\uFF1A${value.device}${value.truncated ? "\uFF0C\u5DF2\u622A\u65AD" : ""}\uFF09\uFF1A`;
        return text([head, ...lines].join("\n"));
      }
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const outcome = await relay.call("list", {
        ...args.path !== void 0 ? { path: args.path } : {},
        ...args.recursive !== void 0 ? { recursive: args.recursive } : {}
      }, exec.signal);
      return { ...outcome.value, device: outcome.device };
    }
  })), "browser-fs: browser_fs_list");
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "browser_fs_read",
    description: "Read a UTF-8 text file from the local directory the user authorized in the dsh web page." + NOT_HOST_FS + " `path` is relative to the authorized root. Content beyond `maxBytes` (default 262144) is truncated and marked as such.",
    parameters: {
      path: { type: "string", required: true, description: "File path relative to the authorized root." },
      maxBytes: { type: "integer", description: "Maximum bytes to read (default 262144 = 256 KiB)." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          content: { type: "string", required: true },
          size: { type: "integer", required: true },
          truncated: { type: "boolean", required: true },
          device: { type: "string", required: true }
        }
      },
      render: (args, value) => {
        const prefix = `[\u8BBE\u5907\uFF1A${value.device} \xB7 ${args.path} \u5171 ${String(value.size)} \u5B57\u8282${value.truncated ? "\uFF0C\u5DF2\u622A\u65AD" : ""}]
`;
        return text(`${prefix}${value.content}`);
      }
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const outcome = await relay.call("read", {
        path: args.path,
        ...args.maxBytes !== void 0 ? { maxBytes: args.maxBytes } : {}
      }, exec.signal);
      return { ...outcome.value, device: outcome.device };
    }
  })), "browser-fs: browser_fs_read");
  ctx.effect(() => ctx.tools.register(defineTool({
    name: "browser_fs_write",
    description: "Write a UTF-8 text file into the local directory the user authorized in the dsh web page." + NOT_HOST_FS + " `path` is relative to the authorized root; parent directories are created automatically. Existing files are overwritten. Returns the number of bytes written.",
    parameters: {
      path: { type: "string", required: true, description: "File path relative to the authorized root." },
      content: { type: "string", required: true, description: "Full UTF-8 text content to write." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string", required: true },
          bytes: { type: "integer", required: true },
          device: { type: "string", required: true }
        }
      },
      render: (_args, value) => text(`\u5DF2\u5199\u5165 ${String(value.bytes)} \u5B57\u8282\u5230 ${value.path}\uFF08\u8BBE\u5907\uFF1A${value.device}\uFF09`)
    },
    async execute(args, exec) {
      const outcome = await relay.call("write", { path: args.path, content: args.content }, exec.signal);
      return { ...outcome.value, device: outcome.device };
    }
  })), "browser-fs: browser_fs_write");
}
export {
  apply,
  inject,
  name
};

# Roadmap — dsh-browser-fs

> 规划备忘，非承诺。变动时同步本文件。

## 一、图片读取返回 ImageBlock（dsh rc.8 原生视觉）

现状：`browser_fs_read` 只回 UTF-8 文本，图片仅卡片内预览（blob URL），
agent 拿不到图片内容。

dsh 侧能力已就绪（2026-08-19 rc.8）：`deepseek-official` 适配器支持按模型
声明 `inputModalities: [text, image]` 的原生图片请求；**工具结果图片**的
契约是——tool 消息内容保持纯字符串，图片合并进随后一条 user 消息
（`Attached image(s) from tool result:` 前缀），收 PNG/JPEG/WebP/GIF，
请求级累计 base64 上限默认 20 MiB（超限从最旧图开始换占位文本）。

要做的事：

- `browser_fs_read` 增加图片分支：MIME 为准入四类时，文本帧之外回传
  ImageBlock（data URL 或附件引用，按 dsh 工具结果契约来）
- 尺寸治理：超附件准入限制时先压缩/缩略再回传，或明确报错指引用预览
- 兼容模式（input[webkitdirectory] 的 File 快照）同路径支持，读 slice
- 场景闭环：手机拍报错截图 → agent `browser_fs_read` 读图 → DeepSeek
  原生视觉排障

## 二、设置卡片（dsh rc.7+ 插件设置页）

dsh rc.7 起插件可自行注册设置卡片。候选项：

- `wsPath`（当前改它要同步改 client 半 `DEFAULT_WS_PATH` 重新 build，
  做成配置后免改码）
- `requestTimeoutMs`
- 卡片默认展开/折叠、默认位置

注意 rc.7 以下版本无此能力，注册失败静默降级。

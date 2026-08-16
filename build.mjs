/**
 * dsh-browser-fs 构建脚本（复刻 dsh packages/client/tsdown.client.ts 的产物契约）：
 *
 *  - lib/index.js  — host 半，ESM，跑在 dsh 宿主 Node 进程里。
 *    `ws` 与 `@deepseek-ai/dsh-tools` 保持 external：运行时由 profile 的
 *    扁平 node_modules 回退（$DSH_HOME/profiles/node_modules）解析到 dsh
 *    安装自带的同一份模块。
 *  - lib/client.js — client 半，CJS 闭包，浏览器加载。产物首尾包装
 *    `window.__ModuleLoader__.load({ id, factory })`，external 仅限
 *    dsh 模块表能回答的 platform modules（react / react/jsx-runtime）；
 *    其余（本包自己的 wire/fs/store/ui）全部 inline。
 *  - lib/highlight.mjs — 语法高亮懒加载 chunk（ESM）：hljs 核心 + 语言子集
 *    + 暗色主题 CSS（.css 以 text loader 内联成字符串，运行时注入 <style>）。
 *    不进 client.js（体积考量），host 半经 /browser-fs/highlight.mjs 路由
 *    供给，client 首次预览已映射语言的文件时才动态 import。
 */
import { build } from 'esbuild'

const PLUGIN_ID = 'dsh-browser-fs'

const shared = {
  bundle: true,
  sourcemap: false,
  minify: false,
  logLevel: 'info',
}

await build({
  ...shared,
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  external: ['ws', '@deepseek-ai/dsh-tools', '@deepseek-ai/*', 'node:*'],
})

// 模块表可回答的 platform modules（packages/client/web/src/platform.ts 的
// PLATFORM_MODULES 子集）：其余依赖一律 inline。
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime', 'react-dom']

await build({
  ...shared,
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: CLIENT_EXTERNALS,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
      'var module = { exports: {} }; var exports = module.exports;',
    ].join('\n'),
  },
  footer: {
    js: 'return module.exports; } });',
  },
})

console.log('build ok: lib/index.js (host, esm) + lib/client.js (browser, cjs closure)')

// 语法高亮懒加载 chunk：独立 ESM 产物，不经 __ModuleLoader__ 包装（host 半
// 静态路由直供，client 原生动态 import）。CSS 以文本内联，运行时注入。
await build({
  ...shared,
  entryPoints: ['src/client/highlight.ts'],
  outfile: 'lib/highlight.mjs',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  loader: { '.css': 'text' },
})

console.log('build ok: lib/highlight.mjs (browser, esm lazy chunk)')

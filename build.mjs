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
const CLIENT_EXTERNALS = ['react', 'react/jsx-runtime']

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

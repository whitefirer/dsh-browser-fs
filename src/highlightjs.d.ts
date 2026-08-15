/**
 * highlight.js 子路径出口的本地类型垫片：包的 exports 只给 "." 标了 types，
 * lib/core 与 lib/languages/* 在 nodenext 解析下拿不到声明，这里补上。
 * '*.css' 配合 build.mjs 的 `loader: { '.css': 'text' }`（CSS 作为文本字符串
 * 内联进 highlight chunk，运行时注入 <style>）。
 */

declare module 'highlight.js/lib/core' {
  import type { HLJSApi } from 'highlight.js'
  const hljs: HLJSApi
  export default hljs
}

declare module 'highlight.js/lib/languages/*' {
  import type { LanguageFn } from 'highlight.js'
  const language: LanguageFn
  export default language
}

declare module '*.css' {
  const css: string
  export default css
}

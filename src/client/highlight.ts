/**
 * 语法高亮懒加载 chunk（独立构建产物 lib/highlight.mjs，host 半经
 * /browser-fs/highlight.mjs 路由供给，预览首次命中已映射语言时才被
 * 动态 import）：highlight.js 核心 + 常用语言子集（非全量，控制体积）+
 * GitHub Dark 主题 CSS（文本内联，加载时注入 <style>）。
 * @module dsh-browser-fs/client/highlight
 */

import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import themeCss from 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('go', go)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

// 主题背景让位给预览卡片底色（卡片自身是暗色半透明），padding 由预览层控制。
const style = document.createElement('style')
style.textContent = `${themeCss}\n.hljs { background: transparent; }\npre code.hljs { padding: 0; }\n`
document.head.appendChild(style)

/**
 * 对已截断的文本做语法着色，返回转义后的 HTML（hljs 输出已转义 & < >，
 * 可安全进 dangerouslySetInnerHTML）。
 * @param code - 待着色文本（调用方已做 64KB 截断）。
 * @param lang - highlight.js 语言 id（preview.ts langFor 的映射结果）。
 * @returns 着色的 HTML 片段。
 */
export function highlightCode(code: string, lang: string): string {
  return hljs.highlight(code, { language: lang }).value
}

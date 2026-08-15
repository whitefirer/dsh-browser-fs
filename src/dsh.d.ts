/**
 * 本地环境类型声明：host 半在运行时通过 profile 的扁平 node_modules 回退
 * 解析到 dsh 安装自带的 @deepseek-ai/dsh-tools（peerDependency，不随本包安装），
 * 本地只做最小结构声明供 tsc/esbuild 使用。
 */

declare module '@deepseek-ai/dsh-tools' {
  /** 模型可读的输出块（本插件只用文本块）。 */
  export interface ContentBlock {
    type: 'text'
    text: string
  }

  /** 工具执行上下文（registry 提供的真实对象字段更多，此处仅声明用到的）。 */
  export interface ToolRunContext {
    readonly callId: string
    readonly signal: AbortSignal
    readonly agent?: {
      readonly session: {
        append(type: string, data: unknown): void
      }
    }
  }

  /** 注册进工具注册表的定义（不透明）。 */
  export interface ToolDefinition {
    readonly name: string
  }

  /**
   * defineTool 的最小声明：参数逐属性 spec / 输出 schema / render / execute。
   * 真实的泛型推断由安装侧提供，本地用显式泛型固定 A（参数）与 V（输出值）。
   */
  export function defineTool<A, V>(options: {
    readonly name: string
    readonly description: string
    readonly parameters: Record<string, unknown>
    readonly output: {
      readonly schema: Record<string, unknown>
      render(args: A, value: V): ContentBlock[]
    }
    readonly timeoutMs?: number
    isConcurrencySafe?(args: A): boolean
    execute(args: A, exec: ToolRunContext): Promise<V>
  }): ToolDefinition
}

/**
 * 兼容模式文件选择器的纯决策逻辑（DOM 无关，smoke 可直接断言）：
 *  - resolveCompatInput：按用户入口 + 能力/前科决定 input 的真实形态；
 *  - classifyCompatChange：change 事件结果分类（0 文件分支绝不静默）。
 * @module dsh-browser-fs/client/compat-picker
 */

/** 用户点的选择入口：整目录（webkitdirectory）/ 多选文件（multiple）。 */
export type CompatPickMode = 'directory' | 'files'

/** input 的实际形态：directory=true 挂 webkitdirectory，false 挂 multiple。 */
export interface CompatInputShape {
  directory: boolean
}

/**
 * 决定一次点击的 input 形态：文件入口恒 multiple；目录入口要求浏览器支持
 * webkitdirectory 且此前没被证实失效（iOS：属性在但选完目录返回 0 个文件）
 * —— 失效后目录入口自动退多选。
 * @param mode - 用户点的入口。
 * @param opts.dirSupported - 浏览器是否支持 webkitdirectory 属性。
 * @param opts.dirBroken - 目录选择是否已有失效前科（上次 change 返回 0 文件）。
 */
export function resolveCompatInput(
  mode: CompatPickMode,
  opts: { dirSupported: boolean; dirBroken: boolean },
): CompatInputShape {
  return { directory: mode === 'directory' && opts.dirSupported && !opts.dirBroken }
}

/** change 事件结果分类。 */
export type CompatChangeOutcome =
  | { kind: 'selected'; directory: boolean }
  | { kind: 'dir-empty' }
  | { kind: 'files-empty' }

/**
 * 分类一次 change：有文件即选中（带回 input 形态供「上次形态」记录）；
 * 目录形态 0 文件 = 目录选择形同虚设（iOS 典型）；多选形态 0 文件是防御
 * 分支（选择器取消不触发 change，正常到不了这里）。
 * @param fileCount - change 时 input.files 的长度（files 为 null 按 0）。
 * @param directoryInput - 本次 input 是否处于 webkitdirectory 形态。
 */
export function classifyCompatChange(fileCount: number, directoryInput: boolean): CompatChangeOutcome {
  if (fileCount > 0) return { kind: 'selected', directory: directoryInput }
  return directoryInput ? { kind: 'dir-empty' } : { kind: 'files-empty' }
}

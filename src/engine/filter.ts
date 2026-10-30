import type { Cell, Region } from './cells'

/** 可以出现在 filter 里的键 */
export const FILTER_KEYS = ['x', 'y', 'z', 'layer', 'paintedFaces', 'exposedFaces', 'region'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

export const REGIONS: readonly Region[] = ['corner', 'edge', 'face', 'inner']

type Single = number | string
export type CellFilter = Partial<Record<FilterKey, Single | readonly Single[]>>

/**
 * 判断 cell 是否满足 filter：
 * - 不同键之间是 AND；
 * - 同一个键的值若是数组，则是 OR；
 * - filter 为 undefined / {} 时匹配全部。
 * 出现未知键直接抛错（防止拼写错误悄悄变成"匹配全部"）。
 */
export function matchCell(cell: Cell, filter?: CellFilter): boolean {
  if (!filter) return true
  for (const key of Object.keys(filter)) {
    if (!(FILTER_KEYS as readonly string[]).includes(key)) {
      throw new Error(`filter 里有不认识的键 "${key}"，可用的键：${FILTER_KEYS.join(', ')}`)
    }
    const want = filter[key as FilterKey]
    if (want === undefined) continue
    const have: Single | undefined = cell[key as FilterKey]
    const list = Array.isArray(want) ? (want as readonly Single[]) : [want as Single]
    if (have === undefined || !list.includes(have)) return false
  }
  return true
}

export function filterCells<T extends Cell>(cells: readonly T[], filter?: CellFilter): T[] {
  return cells.filter((c) => matchCell(c, filter))
}

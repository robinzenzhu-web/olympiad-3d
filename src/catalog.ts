/**
 * catalog.ts —— 题目分组 / 排序 / 上一题下一题（纯函数，可单测）。
 * 规则：按 series 分组（没写 series 的归入"其他"，排在最后）；组内按 order 升序
 * （没写 order 的排在最后，再按标题 / id 稳定排序）；系列之间按名称排序。
 */
import type { Problem } from './schema/problem'

export const OTHER_SERIES = '其他'

export interface SeriesGroup<T extends Problem = Problem> {
  /** 系列名；没有 series 的题归入 OTHER_SERIES */
  name: string
  problems: T[]
}

const zh = new Intl.Collator('zh-Hans-CN', { numeric: true })

function compareInSeries(a: Problem, b: Problem): number {
  const oa = a.order ?? Number.POSITIVE_INFINITY
  const ob = b.order ?? Number.POSITIVE_INFINITY
  if (oa !== ob) return oa < ob ? -1 : 1
  return zh.compare(a.title, b.title) || zh.compare(a.id, b.id)
}

export function groupBySeries<T extends Problem>(problems: readonly T[]): SeriesGroup<T>[] {
  const map = new Map<string, T[]>()
  for (const p of problems) {
    const name = p.series ?? OTHER_SERIES
    const list = map.get(name)
    if (list) list.push(p)
    else map.set(name, [p])
  }
  const groups = [...map.entries()].map(([name, list]) => ({ name, problems: list.slice().sort(compareInSeries) }))
  groups.sort((a, b) => {
    if (a.name === OTHER_SERIES) return b.name === OTHER_SERIES ? 0 : 1
    if (b.name === OTHER_SERIES) return -1
    return zh.compare(a.name, b.name)
  })
  return groups
}

/** 同系列内的上一题 / 下一题（没写 series 的题互为同一组"其他"） */
export function seriesNeighbors<T extends Problem>(problems: readonly T[], id: string): { prev: T | null; next: T | null } {
  for (const g of groupBySeries(problems)) {
    const i = g.problems.findIndex((p) => p.id === id)
    if (i >= 0) return { prev: g.problems[i - 1] ?? null, next: g.problems[i + 1] ?? null }
  }
  return { prev: null, next: null }
}

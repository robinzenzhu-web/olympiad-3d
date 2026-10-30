/** 本项目统一配色（与 DESIGN.md §4/§5 一致） */
export const PAINT_COLOR = '#e5484d' // 涂色面（红）
export const BASE_COLOR = '#f4efe6' // 未涂面（米白）
export const HIGHLIGHT_COLOR = '#f5b301' // 默认高亮黄

/** 允许在 JSON 里直接写的颜色名（给不熟悉十六进制的出题人） */
export const NAMED_COLORS: Record<string, string> = {
  yellow: HIGHLIGHT_COLOR,
  red: PAINT_COLOR,
  blue: '#2f6feb',
  green: '#30a46c',
  purple: '#8e4ec6',
  orange: '#f76b15',
  pink: '#d6409f',
  teal: '#12a594',
  gray: '#8b8d98',
  grey: '#8b8d98',
  black: '#1f2328',
  white: '#ffffff',
}

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** 把颜色名或 #rgb/#rrggbb 规范成 #rrggbb；不合法返回 null */
export function resolveColor(input: string): string | null {
  const s = input.trim().toLowerCase()
  if (s in NAMED_COLORS && Object.prototype.hasOwnProperty.call(NAMED_COLORS, s)) {
    return NAMED_COLORS[s]!.toLowerCase()
  }
  if (!HEX_RE.test(s)) return null
  if (s.length === 4) {
    return '#' + s[1]! + s[1]! + s[2]! + s[2]! + s[3]! + s[3]!
  }
  return s
}

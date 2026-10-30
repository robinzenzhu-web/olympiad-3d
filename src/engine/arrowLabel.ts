/**
 * Arrow 文字的摆放：沿箭身的哪个位置（textAt）+ 在箭身的哪一侧（textSide）。
 * 渲染层（Arrow3D）和取景（fit.ts）共用，保证两边对同一支箭算出同一个位置。
 */
import type { Vec3 } from './cells'

export type ArrowTextAt = 'start' | 'mid' | 'end'
export type ArrowTextSide = 'auto' | 'left' | 'right' | 'above' | 'below'
/** 文字框相对锚点的位置：left = 文字框在锚点右边（锚点贴着框的左边缘），其余同理 */
export type LabelAnchor = 'left' | 'right' | 'above' | 'below'

/** 箭头文字离箭身的像素间距 */
export const ARROW_GAP_PX = 8

export const TEXT_AT_T: Record<ArrowTextAt, number> = { start: 0.12, mid: 0.5, end: 0.88 }

export interface ArrowLabelPlacement {
  point: Vec3
  anchor: LabelAnchor
}

/**
 * auto：竖着的箭，文字在侧面（箭在画面右半边就放左侧，否则放右侧，不掉出画面）；横着的箭，文字在上方。
 * 文字框的“边缘”贴着箭身（留一点空隙），所以文字再长也不会压在箭身上。
 */
export function arrowLabelPlacement(from: Vec3, to: Vec3, at: ArrowTextAt = 'mid', side: ArrowTextSide = 'auto'): ArrowLabelPlacement {
  const k = TEXT_AT_T[at]
  const point = from.map((v, i) => v + (to[i]! - v) * k) as Vec3
  const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const vertical = len > 0 && Math.abs(to[1] - from[1]) / len > 0.7
  let s = side
  if (s === 'auto') s = vertical ? (point[0] > 0 ? 'left' : 'right') : 'above'
  const anchor: LabelAnchor = s === 'left' ? 'right' : s === 'right' ? 'left' : s === 'above' ? 'above' : 'below'
  return { point, anchor }
}

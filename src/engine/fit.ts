/**
 * fit.ts —— 板凳模型（Bench / Arrow）场景的「自动取景」：纯函数，不依赖 three / React。
 *
 * 为什么需要：Bench 场景里的文字（行尾多少、大括号、箭头文字……）是屏幕上固定像素大小的 HTML 标签，
 * 而行有多长、有没有行尾、有没有第二行，每一步都不同；作者靠手写 camera.position 的距离既算不准，
 * 窄屏 / 手机上更会裁切。所以含 Bench 的场景由程序按“当前可见内容的包围盒 + 文字所占像素”算相机距离和目标点，
 * 作者写的 camera 只决定“从哪个方向看”。
 */
import type { Vec3 } from './cells'
import { layoutBench, SPACING, WAS_FONT_PX, type BenchLayout } from './bench'
import { ARROW_GAP_PX, arrowLabelPlacement } from './arrowLabel'
import { textPx } from './textSize'
import { arrowEnds, type SceneState } from './state'

/** 世界坐标里的一块内容 + 它在屏幕上额外占的像素（HTML 文字：向左 / 右 / 上 / 下各伸出多少 px） */
export interface FitRect {
  min: Vec3
  max: Vec3
  /** 额外像素 [左, 右, 上, 下]，默认全 0 */
  pad?: readonly [number, number, number, number]
}

const rect = (x: number, y: number, z: number, pad: FitRect['pad']): FitRect => ({ min: [x, y, z], max: [x, y, z], pad })

/** 以 (x, y) 为中心的一段文字，字号 fontPx，内边距 padX */
function textRect(x: number, y: number, z: number, text: string, fontPx: number, padX = 8): FitRect | null {
  if (!text) return null
  const w = textPx(text, fontPx) / 2 + padX
  const h = fontPx * 0.65 + 3
  return rect(x, y, z, [w, w, h, h])
}

function benchRects(layout: BenchLayout, at: Vec3): FitRect[] {
  const out: FitRect[] = []
  const b = layout.bounds
  out.push({ min: [b.min[0] + at[0], b.min[1] + at[1], b.min[2] + at[2]], max: [b.max[0] + at[0], b.max[1] + at[1], b.max[2] + at[2]] })
  const push = (r: FitRect | null) => r && out.push(r)
  const [ax, ay, az] = at
  if (layout.label) push(textRect(layout.label.x + ax, layout.countY + ay, az, layout.label.text, 24, 4))
  if (layout.remainder) {
    push(textRect(layout.remainder.x + ax, layout.remainder.y + ay, az, layout.remainder.text, 18))
    if (layout.remainder.was) push(textRect(layout.remainder.x + ax, layout.remainder.wasY + ay, az, layout.remainder.was, WAS_FONT_PX))
  }
  for (const br of layout.braces) {
    push(textRect((br.x0 + br.x1) / 2 + ax, br.y + (br.side === 'below' ? -0.45 : 0.45) + ay, az + 0.3, br.text, 16, 6))
  }
  for (const d of layout.dividers) if (d.text) push(textRect(d.x + ax, d.y1 + 0.25 + ay, az, d.text, 14, 2))
  return out
}

/** 文字缩放的下限：再小在手机上就看不清了 */
export const MIN_TEXT_SCALE = 0.7
/** 画布宽度达到这个值（桌面）时文字按原大小 */
export const FULL_TEXT_WIDTH = 830
/** 画布宽度小于这个值就是“窄屏”（手机竖屏）：Bench 的 compactShow / Arrow 的 compactOffset 只在窄屏生效（此时 textScale 已到下限 MIN_TEXT_SCALE） */
export const COMPACT_WIDTH = 600
export function isCompactWidth(canvasWidth: number): boolean {
  return canvasWidth > 0 && canvasWidth < COMPACT_WIDTH
}

/**
 * 3D 文字（.bt）的缩放系数：画布越窄（手机），场景里每一份占的像素越少，如果文字还是桌面那么大，就会互相压在一起；
 * 所以文字随画布宽度缩小（用 CSS zoom 实现，变量 --bs），下限 MIN_TEXT_SCALE。取景算留白时用同一个系数。
 */
export function textScale(canvasWidth: number): number {
  return Math.round(Math.max(MIN_TEXT_SCALE, Math.min(1, canvasWidth / FULL_TEXT_WIDTH)) * 100) / 100
}

/** 把文字占的像素留白（pad）按文字缩放系数缩小；世界坐标部分不变 */
export function scaleFitPads(rects: readonly FitRect[], s: number): FitRect[] {
  if (s === 1) return rects.slice()
  return rects.map((r) => (r.pad ? { ...r, pad: r.pad.map((v) => v * s) as unknown as FitRect['pad'] } : r))
}

/** 每份上方数字标签的字号（与 styles.css 的 .bench-count / .long / .xlong 一致） */
function countFontPx(text: string): number {
  return text.length > 7 ? 12 : text.length > 4 ? 15 : 18
}
/** 方块（block）上的字号（.bench-block） */
const BLOCK_FONT_PX = 15

/** 一行里“每份上方 / 方块上”最宽的那段文字（字号按缩放 1 倍算的像素宽，数字标签含左右内边距） */
function benchLabelWidth(layout: BenchLayout): number {
  let w = 0
  for (const s of layout.slots) if (s.count) w = Math.max(w, textPx(s.count, countFontPx(s.count)) + 12)
  for (const it of layout.items) if (it.text) w = Math.max(w, textPx(it.text, BLOCK_FONT_PX))
  return w
}

export interface SceneFitInfo {
  rects: FitRect[]
  /** 可见的行里，每份上方文字最宽的那个（缩放 1 倍时的像素宽）。相邻两份的文字不能互相压住：见 adaptiveTextScale */
  labelPx: number
}

/**
 * 当前状态里需要放进画面的内容。只有「有可见 Bench、且没有可见的方块类对象」时才返回（含 Arrow）；
 * 其它场景（方块题）返回 null，沿用原来的相机规则。
 */
export function sceneFit(state: SceneState, compact = false): FitRect[] | null {
  return sceneFitInfo(state, compact)?.rects ?? null
}

/** sceneFit + 每份文字的最大宽度（窄屏文字自适应缩放要用） */
export function sceneFitInfo(state: SceneState, compact = false): SceneFitInfo | null {
  const rects: FitRect[] = []
  let hasBench = false
  let labelPx = 0
  for (const id of state.order) {
    const o = state.objects[id]!
    if (!o.visible) continue
    if (o.bench) {
      hasBench = true
      const lay = layoutBench(o.bench, compact)
      labelPx = Math.max(labelPx, benchLabelWidth(lay))
      rects.push(...benchRects(lay, o.position))
    } else if (o.arrow) {
      const a = o.arrow
      const { from, to } = arrowEnds(o, compact)
      const p = arrowLabelPlacement(from, to, a.textAt, a.textSide)
      rects.push({ min: from.map((v, k) => Math.min(v, to[k]!)) as Vec3, max: from.map((v, k) => Math.max(v, to[k]!)) as Vec3, pad: [4, 4, 4, 4] })
      if (o.text) {
        const w = textPx(o.text, 15) + 16 + 2
        const h = 15 * 0.65 + 5
        const g = ARROW_GAP_PX
        const pad: [number, number, number, number] =
          p.anchor === 'left' ? [0, g + w, h, h] : p.anchor === 'right' ? [g + w, 0, h, h] : p.anchor === 'above' ? [w / 2, w / 2, g + 2 * h, 0] : [w / 2, w / 2, 0, g + 2 * h]
        rects.push(rect(p.point[0], p.point[1], p.point[2], pad))
      }
    } else if (o.cells.length > 0 || o.type === 'Label') {
      // 方块 / 标签：不走自动取景
      return null
    }
  }
  return hasBench ? { rects, labelPx } : null
}

export interface FitOptions {
  /** 画布像素尺寸 */
  width: number
  height: number
  /** 透视相机垂直视角（度） */
  fov: number
  /** 画面四周留白（px）：左右 / 上下（上边要避开右上角的「重置视角」按钮） */
  marginX?: number
  marginY?: number
  minDist?: number
  maxDist?: number
}

/** 文字自适应缩放的下限：比 MIN_TEXT_SCALE 更小，但再小就看不清了；份实在太多时宁可小一点也别互相压住 */
export const MIN_ADAPT_TEXT_SCALE = 0.5
/** 相邻两份的文字最宽只能占份间距的这么多（文字宽度是估算的，留余量） */
export const LABEL_PITCH_RATIO = 0.85

export interface FitResult {
  /** 应当看向的点（z 固定 0） */
  center: [number, number]
  /** 相机到目标点的距离 */
  dist: number
}

/**
 * 求能装下所有内容的最小相机距离（透视，相机沿 +z 方向看向目标）以及目标点（内容的屏幕居中位置）。
 * 每块内容按它最靠近相机的那个 z 面算大小（偏保守），文字的像素宽度另算。
 */
export function fitCamera(rects: readonly FitRect[], o: FitOptions): FitResult {
  const marginX = o.marginX ?? 24
  const marginY = o.marginY ?? 44
  const minDist = o.minDist ?? 6.5
  const maxDist = o.maxDist ?? 45
  const t = Math.tan((o.fov * Math.PI) / 360)
  const W = Math.max(o.width, 1)
  const H = Math.max(o.height, 1)

  let lo: Vec3 = [Infinity, Infinity, 0]
  let hi: Vec3 = [-Infinity, -Infinity, 0]
  for (const r of rects) {
    lo = [Math.min(lo[0], r.min[0]), Math.min(lo[1], r.min[1]), 0]
    hi = [Math.max(hi[0], r.max[0]), Math.max(hi[1], r.max[1]), 0]
  }
  let cx = (lo[0] + hi[0]) / 2
  let cy = (lo[1] + hi[1]) / 2

  /** 在距离 d、目标 (cx, cy) 下，所有内容相对画面中心的像素范围 [左, 右, 上, 下]（都是向外的正数） */
  const extents = (d: number): [number, number, number, number] => {
    let l = -Infinity
    let r = -Infinity
    let u = -Infinity
    let b = -Infinity
    for (const f of rects) {
      const depth = Math.max(d - f.max[2], 0.3)
      const ppu = H / 2 / (depth * t)
      const p = f.pad ?? [0, 0, 0, 0]
      l = Math.max(l, (cx - f.min[0]) * ppu + p[0])
      r = Math.max(r, (f.max[0] - cx) * ppu + p[1])
      u = Math.max(u, (f.max[1] - cy) * ppu + p[2])
      b = Math.max(b, (cy - f.min[1]) * ppu + p[3])
    }
    return [l, r, u, b]
  }
  const fits = (d: number) => {
    const [l, r, u, b] = extents(d)
    return Math.max(l, r) <= W / 2 - marginX && Math.max(u, b) <= H / 2 - marginY
  }
  const solve = (): number => {
    if (!fits(maxDist)) return maxDist
    if (fits(minDist)) return minDist
    let a = minDist
    let z = maxDist
    for (let i = 0; i < 40; i++) {
      const m = (a + z) / 2
      if (fits(m)) z = m
      else a = m
    }
    return z
  }

  let d = solve()
  // 文字像素不对称（比如右边的“多18朵”伸出得比左边多）时，把目标点往多的一边挪，使内容在画面里居中；几轮就收敛
  for (let k = 0; k < 4; k++) {
    const [l, r, u, b] = extents(d)
    const ppu = H / 2 / (d * t)
    cx += (r - l) / 2 / ppu
    cy += (u - b) / 2 / ppu
    d = solve()
  }
  return { center: [cx, cy], dist: d }
}

/**
 * 文字自适应缩放：在 textScale（按画布宽度）的基础上，如果每一份上方的文字（数字标签 / 方块上的字）
 * 比两份之间的屏幕间距还宽（行很长、手机竖屏），相邻的字就会互相压住——这时再把文字缩小，直到不压为止（不低于 MIN_ADAPT_TEXT_SCALE）。
 *
 * 文字越小 → 取景留白越小 → 相机越近 → 份间距越大，所以“能不能放下”随缩放系数单调：二分求最大的可行系数。
 * labelPx 为 0（没有文字 / 不是 Bench 场景）时原样返回 base，保证老内容不受影响。
 */
export function adaptiveTextScale(rects: readonly FitRect[], labelPx: number, o: FitOptions, base: number): number {
  if (labelPx <= 0 || rects.length === 0) return base
  const t = Math.tan((o.fov * Math.PI) / 360)
  const pitchPx = (s: number): number => {
    const { dist } = fitCamera(scaleFitPads(rects, s), o)
    return SPACING * (Math.max(o.height, 1) / 2 / (dist * t))
  }
  const ok = (s: number): boolean => s * labelPx <= pitchPx(s) * LABEL_PITCH_RATIO
  const floor = Math.min(base, MIN_ADAPT_TEXT_SCALE)
  if (ok(base)) return base
  if (!ok(floor)) return floor
  let lo = floor
  let hi = base
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2
    if (ok(m)) lo = m
    else hi = m
  }
  return Math.floor(lo * 100) / 100
}

/** Bench 用到的几何体（模块级共享，不随组件卸载释放：总共只有十几个小几何体） */
import { BoxGeometry, CapsuleGeometry, CylinderGeometry, EdgesGeometry, LineSegments, SphereGeometry, type BufferGeometry } from 'three'
import type { Container, TokenShape } from '../schema/problem'

type V3 = [number, number, number]

export interface PartSpec {
  geometry: BufferGeometry
  position: V3
  /** 固定颜色（头、茎等）；不写则跟随 token 本身的颜色 */
  accent?: string
}

const sphere = (r: number) => new SphereGeometry(r, 20, 14)
const cyl = (rt: number, rb: number, h: number, n = 24) => new CylinderGeometry(rt, rb, h, n)

function flower(): PartSpec[] {
  const parts: PartSpec[] = [
    { geometry: cyl(0.016, 0.016, 0.17, 8), position: [0, -0.1, 0], accent: '#4c9f70' },
    { geometry: sphere(0.05), position: [0, 0.06, 0.02], accent: '#f6c945' },
  ]
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2
    parts.push({ geometry: sphere(0.055), position: [Math.cos(a) * 0.085, 0.06 + Math.sin(a) * 0.085, 0], })
  }
  return parts
}

/** 每种 token 的组成（以自身中心为原点，高度见 bench.ts 的 SHAPE_H） */
export const SHAPE_PARTS: Record<TokenShape, PartSpec[]> = {
  ball: [{ geometry: sphere(0.15), position: [0, 0, 0] }],
  disc: [{ geometry: cyl(0.17, 0.17, 0.07), position: [0, 0, 0] }],
  cube: [{ geometry: new BoxGeometry(0.27, 0.27, 0.27), position: [0, 0, 0] }],
  person: [
    { geometry: new CapsuleGeometry(0.09, 0.18, 6, 14), position: [0, -0.07, 0] },
    { geometry: sphere(0.08), position: [0, 0.19, 0], accent: '#f0d5b8' },
  ],
  cup: [{ geometry: cyl(0.13, 0.1, 0.3, 20), position: [0, 0, 0] }],
  flower: flower(),
}

/** 容器：一份下面的"板凳 / 盘子 / 小人 / 盒子"。顶面在 y=0，物品放在上面 */
export interface ContainerPart {
  geometry: BufferGeometry
  position: V3
  /** 是否描边（弯曲的几何体不描） */
  edges: boolean
}

const box = (w: number, h: number, d: number) => new BoxGeometry(w, h, d)

export const CONTAINER_PARTS: Record<Container, ContainerPart[]> = {
  seat: [
    { geometry: box(1.0, 0.1, 0.62), position: [0, -0.05, 0], edges: true },
    { geometry: box(0.08, 0.2, 0.5), position: [-0.4, -0.2, 0], edges: true },
    { geometry: box(0.08, 0.2, 0.5), position: [0.4, -0.2, 0], edges: true },
  ],
  plate: [{ geometry: cyl(0.5, 0.4, 0.06, 40), position: [0, -0.03, 0], edges: false }],
  person: [
    { geometry: new CapsuleGeometry(0.19, 0.36, 8, 18), position: [0, 0.37, -0.2], edges: false },
    { geometry: sphere(0.17), position: [0, 0.9, -0.2], edges: false },
  ],
  box: [
    { geometry: box(1.0, 0.05, 0.8), position: [0, -0.025, 0], edges: true },
    { geometry: box(1.0, 0.22, 0.04), position: [0, 0.11, -0.38], edges: true },
    { geometry: box(1.0, 0.22, 0.04), position: [0, 0.11, 0.38], edges: true },
    { geometry: box(0.04, 0.22, 0.8), position: [-0.48, 0.11, 0], edges: true },
    { geometry: box(0.04, 0.22, 0.8), position: [0.48, 0.11, 0], edges: true },
  ],
  none: [],
}

// ---------- 描边（共享，按几何体缓存） ----------
const edgesCache = new WeakMap<BufferGeometry, EdgesGeometry>()
export function edgesOf(g: BufferGeometry): EdgesGeometry {
  let e = edgesCache.get(g)
  if (!e) {
    e = new EdgesGeometry(g, 30)
    edgesCache.set(g, e)
  }
  return e
}

/** 虚线描边用的盒子线框（算好 lineDistance，才能画虚线）。按尺寸缓存 */
const dashedBoxCache = new Map<string, EdgesGeometry>()
export function dashedBox(w: number, h: number, d: number): EdgesGeometry {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`
  let g = dashedBoxCache.get(key)
  if (!g) {
    g = new EdgesGeometry(new BoxGeometry(w, h, d))
    new LineSegments(g).computeLineDistances() // 把 lineDistance 属性写进几何体
    dashedBoxCache.set(key, g)
  }
  return g
}

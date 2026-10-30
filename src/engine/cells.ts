/**
 * cells.ts —— CubeGrid / CubeStack 的 cell 属性预计算（纯函数，无 React / three 依赖）。
 *
 * 坐标约定：x 向右，y 向上，z 朝向观察者（three.js 默认相机在 +z）。
 * CubeStack 的 heights[row][col]：col → x，row → z（row 越大越靠近观察者，即「前」）。
 */

export type Vec3 = [number, number, number]

/** 六个面的顺序，与 three.js BoxGeometry 的面顺序一致 */
export const FACE_NAMES = ['+x', '-x', '+y', '-y', '+z', '-z'] as const
export type FaceName = (typeof FACE_NAMES)[number]
export type FaceFlags = [boolean, boolean, boolean, boolean, boolean, boolean]

export type Region = 'corner' | 'edge' | 'face' | 'inner'

export interface Cell {
  /** 稳定 key："x,y,z" */
  key: string
  x: number
  y: number
  z: number
  /** = y */
  layer: number
  /** 暴露在外的面数（CubeStack 不含朝地的底面） */
  exposedFaces: number
  /** 涂色的面数：CubeGrid paint=surface 时 = exposedFaces，paint=none 时 = 0；CubeStack = exposedFaces */
  paintedFaces: number
  /** 仅 CubeGrid：按外露面数 3/2/1/0 映射为 corner/edge/face/inner（外露面数 >3 的退化形状没有 region） */
  region?: Region
  /** 六个面各自是否「涂色面」（顺序见 FACE_NAMES） */
  paintedSides: FaceFlags
}

export interface CellSet {
  cells: Cell[]
  /** 包围盒尺寸（单位：格），用于居中 */
  dims: Vec3
}

export type GridPaint = 'surface' | 'none'

const REGION_BY_FACES: Record<number, Region> = { 3: 'corner', 2: 'edge', 1: 'face', 0: 'inner' }

function count(flags: FaceFlags): number {
  return flags.reduce<number>((n, f) => n + (f ? 1 : 0), 0)
}

/** 构建 CubeGrid 的所有 cell，顺序按 y, z, x */
export function buildGridCells(size: Vec3, paint: GridPaint = 'none'): CellSet {
  const [nx, ny, nz] = size
  const cells: Cell[] = []
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const outer: FaceFlags = [x === nx - 1, x === 0, y === ny - 1, y === 0, z === nz - 1, z === 0]
        const exposed = count(outer)
        const painted: FaceFlags = paint === 'surface' ? outer : [false, false, false, false, false, false]
        const cell: Cell = {
          key: `${x},${y},${z}`,
          x,
          y,
          z,
          layer: y,
          exposedFaces: exposed,
          paintedFaces: paint === 'surface' ? exposed : 0,
          paintedSides: painted,
        }
        const region = REGION_BY_FACES[exposed]
        if (region) cell.region = region
        cells.push(cell)
      }
    }
  }
  return { cells, dims: [nx, ny, nz] }
}

/** 构建 CubeStack 的所有 cell（heights 为俯视高度图），顺序按 y, z, x */
export function buildStackCells(heights: number[][]): CellSet {
  const rows = heights.length
  const cols = heights.reduce((m, r) => Math.max(m, r.length), 0)
  const maxH = heights.reduce((m, r) => Math.max(m, ...r, 0), 0)
  const h = (x: number, z: number): number => heights[z]?.[x] ?? 0
  const has = (x: number, y: number, z: number): boolean =>
    x >= 0 && z >= 0 && x < cols && z < rows && y < h(x, z) && y >= 0

  const cells: Cell[] = []
  for (let y = 0; y < maxH; y++) {
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        if (!has(x, y, z)) continue
        // 面朝向顺序：+x -x +y -y +z -z；底面(y=0 的 -y)贴地，视为不外露
        const exposedSides: FaceFlags = [
          !has(x + 1, y, z),
          !has(x - 1, y, z),
          !has(x, y + 1, z),
          y > 0 && !has(x, y - 1, z),
          !has(x, y, z + 1),
          !has(x, y, z - 1),
        ]
        const exposed = count(exposedSides)
        cells.push({
          key: `${x},${y},${z}`,
          x,
          y,
          z,
          layer: y,
          exposedFaces: exposed,
          paintedFaces: exposed,
          paintedSides: exposedSides,
        })
      }
    }
  }
  return { cells, dims: [cols, maxH, rows] }
}

/** 统计：按键值分组计数，例如 countBy(cells, c => c.paintedFaces) */
export function countBy(cells: readonly Cell[], fn: (c: Cell) => string | number | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of cells) {
    const k = String(fn(c))
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

/** cell 的局部中心位置（含 gap 与整体居中），渲染层与测试共用 */
export function cellPosition(cell: Cell, dims: Vec3, gap: number): Vec3 {
  const s = 1 + gap
  return [(cell.x - (dims[0] - 1) / 2) * s, (cell.y - (dims[1] - 1) / 2) * s, (cell.z - (dims[2] - 1) / 2) * s]
}

/** number 动作的排序：按 y, z, x */
export function compareCells(a: Cell, b: Cell): number {
  return a.y - b.y || a.z - b.z || a.x - b.x
}

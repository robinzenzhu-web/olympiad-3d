import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { BoxGeometry, BufferAttribute, Color, MeshStandardMaterial, Vector3, type Group, type Mesh } from 'three'
import * as easing from 'maath/easing'
import { cellPosition, type Vec3 } from '../engine/cells'
import { BASE_COLOR, PAINT_COLOR } from '../engine/colors'
import type { CellState, ObjectState } from '../engine/state'
import { DomTag } from './DomTag'

/** 所有过渡的平滑时间（秒）：约 0.5s 内收敛 */
export const SMOOTH = 0.13
const CUBE = 0.97 // 比 1 略小一点，合拢时能看出一条细缝
const EDGE_COLOR = '#2b3036'
const BASE = new Color(BASE_COLOR)
const PAINT = new Color(PAINT_COLOR)

const baseGeometry = new BoxGeometry(CUBE, CUBE, CUBE)

interface Anim {
  colors: Color[]
  opacity: number
  scale: number
  placed: boolean
}

function targetColors(cs: CellState, painted: boolean): Color[] {
  const hl = cs.highlight ? new Color(cs.highlight) : null
  return cs.cell.paintedSides.map((isPainted) => hl ?? (painted && isPainted ? PAINT : BASE))
}

function writeColors(attr: BufferAttribute, colors: Color[]) {
  const arr = attr.array as Float32Array
  for (let f = 0; f < 6; f++) {
    const c = colors[f]!
    for (let v = 0; v < 4; v++) {
      const i = (f * 4 + v) * 3
      arr[i] = c.r
      arr[i + 1] = c.g
      arr[i + 2] = c.b
    }
  }
  attr.needsUpdate = true
}

interface CellMeshProps {
  cs: CellState
  dims: Vec3
  gap: number
  objVisible: boolean
  painted: boolean
}

/** 一个小正方体：每个面单独着色（顶点色），位置/透明度/颜色/缩放全部在 useFrame 里阻尼插值 */
function CellMesh({ cs, dims, gap, objVisible, painted }: CellMeshProps) {
  const group = useRef<Group>(null)
  const mesh = useRef<Mesh>(null)
  const edges = useRef<React.ComponentRef<typeof Edges>>(null)

  const targets = useMemo(() => targetColors(cs, painted), [cs, painted])
  const targetPos = useMemo(() => new Vector3(...cellPosition(cs.cell, dims, gap)), [cs.cell, dims, gap])
  const targetOpacity = objVisible ? cs.opacity : 0

  const geometry = useMemo(() => {
    const g = baseGeometry.clone()
    g.setAttribute('color', new BufferAttribute(new Float32Array(24 * 3), 3))
    return g
  }, [])
  const material = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, transparent: true }),
    [],
  )
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  const anim = useRef<Anim>(null as unknown as Anim)
  if (!anim.current) {
    const colors = targets.map((c) => c.clone())
    writeColors(geometry.getAttribute('color') as BufferAttribute, colors)
    anim.current = { colors, opacity: 0, scale: 0.01, placed: false }
  }

  useFrame((_, delta) => {
    const g = group.current
    const a = anim.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    if (!a.placed) {
      g.position.copy(targetPos)
      a.placed = true
    } else {
      easing.damp3(g.position, targetPos, SMOOTH, dt)
    }
    easing.damp(a, 'opacity', targetOpacity, SMOOTH, dt)
    easing.damp(a, 'scale', 1, SMOOTH, dt)
    g.scale.setScalar(Math.max(a.scale, 0.001))
    g.visible = a.opacity > 0.01

    material.opacity = a.opacity
    material.depthWrite = a.opacity > 0.98
    const em = edges.current?.material
    if (em) {
      em.opacity = a.opacity * 0.9
      em.depthWrite = a.opacity > 0.98
    }

    let moved = false
    for (let f = 0; f < 6; f++) {
      if (easing.dampC(a.colors[f]!, targets[f]!, SMOOTH, dt)) moved = true
    }
    if (moved) writeColors(geometry.getAttribute('color') as BufferAttribute, a.colors)
  })

  // 注意：Edges 不要写静态 opacity —— 描边的 opacity / depthWrite 完全由上面的 useFrame 驱动
  const showBadge = cs.number !== null && targetOpacity > 0.05
  return (
    <group ref={group}>
      <mesh ref={mesh} geometry={geometry} material={material} raycast={() => null}>
        <Edges ref={edges} lineWidth={1.2} color={EDGE_COLOR} transparent />
      </mesh>
      {showBadge && (
        <DomTag key={cs.number!} text={String(cs.number)} className="num-badge" delayMs={Math.min((cs.number! - 1) * 80, 1600)} />
      )}
    </group>
  )
}

/** CubeGrid / CubeStack 共用：一个对象 = 一组 cell */
export function CellGroup({ obj, painted }: { obj: ObjectState; painted: boolean }) {
  const group = useRef<Group>(null)
  const target = useMemo(() => new Vector3(...obj.position), [obj.position])
  const placed = useRef(false)

  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    if (!placed.current) {
      g.position.copy(target)
      placed.current = true
    } else {
      easing.damp3(g.position, target, SMOOTH, Math.min(delta, 0.05))
    }
  })

  return (
    <group ref={group}>
      {obj.cells.map((cs) => (
        <CellMesh key={cs.cell.key} cs={cs} dims={obj.dims} gap={obj.gap} objVisible={obj.visible} painted={painted} />
      ))}
    </group>
  )
}

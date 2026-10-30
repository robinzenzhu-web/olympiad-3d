import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { BoxGeometry, Color, LineBasicMaterial, LineDashedMaterial, LineSegments, MeshStandardMaterial, SphereGeometry, Vector3, type Group } from 'three'
import * as easing from 'maath/easing'
import {
  BENCH_RED,
  BLOCK_D,
  BLOCK_W,
  CAPTION_Y,
  REMAINDER_COLOR,
  TOKEN_W,
  bracePoints,
  layoutBench,
  type BenchLayout,
  type LayoutBrace,
  type LayoutDivider,
  type LayoutItem,
  type LayoutSlot,
} from '../engine/bench'
import type { ObjectState } from '../engine/state'
import type { TokenShape } from '../schema/problem'
import { SMOOTH } from './CellGroup'
import { DomTag } from './DomTag'
import { CONTAINER_PARTS, SHAPE_PARTS, dashedBox, edgesOf } from './benchGeometry'

const EDGE = '#2b3036'
const CONTAINER_COLOR = '#d8dbe2'
const CONTAINER_EDGE = '#9aa0aa'
const NOTE_COLOR = '#2f6feb'
const UNIT_BOX = new BoxGeometry(1, 1, 1)
const UNIT_BOX_EDGES = edgesOf(UNIT_BOX)
const DOT = new SphereGeometry(0.055, 12, 10)

// ---------- 「消失的东西先缩小再卸载」 ----------
interface Retained<T> {
  key: string
  data: T
  gone: boolean
}

/**
 * 当前存在的 + 刚刚消失、还在缩小淡出的（gone=true）。
 * 组件缩到看不见后调用 drop(key) 真正卸载。items 必须是 useMemo 出来的（identity 变了才认为有变化）。
 */
function useRetained<T>(items: ReadonlyMap<string, T>) {
  const st = useRef({ prev: items, ghosts: new Map<string, T>() })
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const s = st.current
  if (s.prev !== items) {
    for (const [k, v] of s.prev) if (!items.has(k)) s.ghosts.set(k, v)
    for (const k of items.keys()) s.ghosts.delete(k)
    s.prev = items
  }
  const drop = useCallback((key: string) => {
    if (st.current.ghosts.delete(key)) bump()
  }, [])
  const list: Retained<T>[] = []
  for (const [key, data] of items) list.push({ key, data, gone: false })
  for (const [key, data] of s.ghosts) list.push({ key, data, gone: true })
  return { list, drop }
}

const cls = (kind: string, on: boolean, dim = false) => `bt ${kind}${on ? ' on' : ''}${dim ? ' dim' : ''}`

// ---------- token / block ----------
function ItemMesh({ item, alive, gone, onGone }: { item: LayoutItem; alive: boolean; gone: boolean; onGone: (id: string) => void }) {
  const group = useRef<Group>(null)
  const isBlock = item.shape === 'block'
  const parts = isBlock ? null : SHAPE_PARTS[item.shape as TokenShape]
  const target = useMemo(() => new Vector3(item.x, item.y, item.z), [item.x, item.y, item.z])
  const targetColor = useMemo(() => new Color(item.color), [item.color])

  const materials = useMemo(
    () => (parts ?? [null]).map((p) => new MeshStandardMaterial({ color: p?.accent ?? '#ffffff', roughness: 0.55, metalness: 0, transparent: true })),
    [parts],
  )
  const blockLine = useMemo(() => new LineBasicMaterial({ color: EDGE, transparent: true }), [])
  const dashed = useMemo(() => new LineDashedMaterial({ color: BENCH_RED, dashSize: 0.05, gapSize: 0.035, transparent: true, depthWrite: false }), [])
  const outline = useMemo(() => {
    // 虚影描边：block 是一个虚线盒子；token 只画正对观众的一张扁框（行尾堆里几十个虚影时，前后线框会缠成一团）
    return new LineSegments(isBlock ? dashedBox(BLOCK_W + 0.04, item.h + 0.04, BLOCK_D + 0.04) : dashedBox(TOKEN_W + 0.02, Math.max(item.h - 0.02, 0.05), 0.01), dashed)
  }, [isBlock, item.h, dashed])
  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose())
      blockLine.dispose()
      dashed.dispose()
    },
    [materials, blockLine, dashed],
  )

  const anim = useRef({ s: 0, op: 1, ghost: 0, color: new Color(item.color), placed: false, reported: false })

  useFrame((_, delta) => {
    const g = group.current
    const a = anim.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    if (!a.placed) {
      g.position.copy(target)
      a.placed = true
    } else {
      easing.damp3(g.position, target, SMOOTH, dt)
    }
    easing.damp(a, 's', alive ? 1 : 0, SMOOTH, dt)
    g.scale.setScalar(Math.max(a.s, 0.001))
    g.visible = a.s > 0.01
    easing.damp(a, 'ghost', item.ghost ? 1 : 0, SMOOTH, dt)
    easing.damp(a, 'op', item.ghost ? 0.38 : item.dim ? 0.3 : 1, SMOOTH, dt)
    easing.dampC(a.color, targetColor, SMOOTH, dt)
    materials.forEach((m, i) => {
      m.opacity = a.op
      m.depthWrite = a.op > 0.95
      if (!parts?.[i]?.accent) m.color.copy(a.color)
    })
    blockLine.opacity = a.op * 0.9
    if (item.ghost) dashed.color.set(item.ghost)
    dashed.opacity = a.ghost
    outline.visible = a.ghost > 0.02
    if (gone) {
      if (a.s < 0.02 && !a.reported) {
        a.reported = true
        onGone(item.id)
      }
    } else a.reported = false
  })

  return (
    <group ref={group}>
      {parts ? (
        parts.map((p, i) => <mesh key={i} geometry={p.geometry} material={materials[i]} position={p.position} raycast={() => null} />)
      ) : (
        <>
          <mesh geometry={UNIT_BOX} material={materials[0]} scale={[BLOCK_W, item.h * 0.96, BLOCK_D]} raycast={() => null} />
          <lineSegments geometry={UNIT_BOX_EDGES} material={blockLine} scale={[BLOCK_W, item.h * 0.96, BLOCK_D]} />
        </>
      )}
      <primitive object={outline} />
      {isBlock && <DomTag text={item.text ?? ''} className={cls('bench-block', alive)} zIndex={15} />}
    </group>
  )
}

// ---------- 容器（板凳 / 盘子 / 小人 / 盒子）+ 数字 + 说明字 + 红叉 ----------
const crossGeo = new BoxGeometry(1.15, 0.08, 0.06)

function ContainerMesh({ slot, countY, alive, gone, onGone }: { slot: LayoutSlot; countY: number; alive: boolean; gone: boolean; onGone: (key: string) => void }) {
  const outer = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const crossG = useRef<Group>(null)
  const parts = CONTAINER_PARTS[slot.container]
  const targetColor = useMemo(() => new Color(slot.highlight ?? CONTAINER_COLOR), [slot.highlight])
  const crossColor = useMemo(() => new Color(slot.cross ?? BENCH_RED), [slot.cross])
  const mat = useMemo(() => new MeshStandardMaterial({ color: CONTAINER_COLOR, roughness: 0.8, metalness: 0, transparent: true }), [])
  const line = useMemo(() => new LineBasicMaterial({ color: CONTAINER_EDGE, transparent: true }), [])
  const crossMat = useMemo(() => new MeshStandardMaterial({ color: BENCH_RED, roughness: 0.5, transparent: true }), [])
  useEffect(
    () => () => {
      mat.dispose()
      line.dispose()
      crossMat.dispose()
    },
    [mat, line, crossMat],
  )
  const anim = useRef({ s: 0, op: 1, cross: 0, color: new Color(CONTAINER_COLOR), x: slot.x, placed: false, reported: false })
  // 红叉的中心高度 / 大小跟着容器走。none（没有容器，只有一块 0.45 高的方块）：叉缩小、落在方块上，
  // 否则两条斜臂会伸到上方的数字标签里（被标签底色盖住一半，只露出几个小红点）
  const crossY = slot.container === 'person' ? 0.55 : slot.container === 'none' ? 0.225 : 0.4
  const crossScale = slot.container === 'none' ? 0.75 : 1

  useFrame((_, delta) => {
    const o = outer.current
    const i = inner.current
    const a = anim.current
    if (!o || !i) return
    const dt = Math.min(delta, 0.05)
    if (!a.placed) {
      a.x = slot.x
      a.placed = true
    } else easing.damp(a, 'x', slot.x, SMOOTH, dt)
    o.position.x = a.x
    easing.damp(a, 's', alive ? 1 : 0, SMOOTH, dt)
    i.scale.setScalar(Math.max(a.s, 0.001))
    i.visible = a.s > 0.01
    easing.damp(a, 'op', slot.dim ? 0.3 : 1, SMOOTH, dt)
    easing.dampC(a.color, targetColor, SMOOTH, dt)
    mat.color.copy(a.color)
    mat.opacity = a.op
    mat.depthWrite = a.op > 0.95
    line.opacity = a.op
    easing.damp(a, 'cross', slot.cross && alive ? 1 : 0, SMOOTH, dt)
    const c = crossG.current
    if (c) {
      c.scale.setScalar(Math.max(a.cross * crossScale, 0.001))
      c.visible = a.cross > 0.01
      crossMat.color.copy(crossColor)
      crossMat.opacity = a.op
    }
    if (gone) {
      if (a.s < 0.02 && !a.reported) {
        a.reported = true
        onGone(`c${slot.index}`)
      }
    } else a.reported = false
  })

  const dim = slot.dim
  return (
    <group ref={outer} position={[slot.x, 0, 0]}>
      <group ref={inner}>
        {parts.map((p, k) => (
          <group key={k} position={p.position}>
            <mesh geometry={p.geometry} material={mat} raycast={() => null} />
            {p.edges && <lineSegments geometry={edgesOf(p.geometry)} material={line} />}
          </group>
        ))}
      </group>
      <group ref={crossG} position={[0, crossY, 0.45]}>
        <mesh geometry={crossGeo} material={crossMat} rotation={[0, 0, Math.PI / 4]} raycast={() => null} />
        <mesh geometry={crossGeo} material={crossMat} rotation={[0, 0, -Math.PI / 4]} raycast={() => null} />
      </group>
      <group position={[0, countY, 0]}>
        {/* 数字标签太长（如 "28元+10"）时自动缩小字号，避免相邻两份的数字相互压住 */}
        <DomTag
          text={slot.count}
          className={cls(`bench-count${slot.count.length > 7 ? ' xlong' : slot.count.length > 4 ? ' long' : ''}`, alive && slot.count !== '', dim)}
          zIndex={22}
        />
      </group>
      <group position={[0, CAPTION_Y[slot.container], 0]}>
        <DomTag text={slot.caption ?? ''} className={cls('bench-caption', alive && !!slot.caption, dim)} zIndex={18} />
      </group>
    </group>
  )
}

// ---------- 省略号 ----------
function GapMarks({ x, y, alive, gone, onGone, id }: { x: number; y: number; alive: boolean; gone: boolean; onGone: (key: string) => void; id: string }) {
  const g = useRef<Group>(null)
  const mat = useMemo(() => new MeshStandardMaterial({ color: '#8b8d98', roughness: 0.7 }), [])
  useEffect(() => () => mat.dispose(), [mat])
  const a = useRef({ s: 0, x, y, placed: false, reported: false })
  useFrame((_, delta) => {
    const o = g.current
    if (!o) return
    const dt = Math.min(delta, 0.05)
    const s = a.current
    if (!s.placed) {
      s.x = x
      s.y = y
      s.placed = true
    } else {
      easing.damp(s, 'x', x, SMOOTH, dt)
      easing.damp(s, 'y', y, SMOOTH, dt)
    }
    easing.damp(s, 's', alive ? 1 : 0, SMOOTH, dt)
    o.position.set(s.x, s.y, 0)
    o.scale.setScalar(Math.max(s.s, 0.001))
    o.visible = s.s > 0.01
    if (gone) {
      if (s.s < 0.02 && !s.reported) {
        s.reported = true
        onGone(id)
      }
    } else s.reported = false
  })
  return (
    <group ref={g}>
      {[-0.2, 0, 0.2].map((dx) => (
        <mesh key={dx} geometry={DOT} material={mat} position={[dx, 0, 0]} raycast={() => null} />
      ))}
    </group>
  )
}

// ---------- 大括号 / 竖线 ----------
function BraceMesh({ brace, alive, gone, onGone }: { brace: LayoutBrace; alive: boolean; gone: boolean; onGone: (key: string) => void }) {
  const g = useRef<Group>(null)
  const width = brace.x1 - brace.x0
  const points = useMemo(() => bracePoints(width, brace.side), [width, brace.side])
  const cx = (brace.x0 + brace.x1) / 2
  const sign = brace.side === 'below' ? -1 : 1
  const r = Math.min(0.16, Math.max(width, 0.4) / 5)
  const baseY = brace.y + (brace.side === 'below' ? -r : r)
  const a = useRef({ s: 0, x: cx, y: baseY, placed: false, reported: false })
  useFrame((_, delta) => {
    const o = g.current
    if (!o) return
    const dt = Math.min(delta, 0.05)
    const s = a.current
    if (!s.placed) {
      s.x = cx
      s.y = baseY
      s.placed = true
    } else {
      easing.damp(s, 'x', cx, SMOOTH, dt)
      easing.damp(s, 'y', baseY, SMOOTH, dt)
    }
    easing.damp(s, 's', alive ? 1 : 0, SMOOTH, dt)
    o.position.set(s.x, s.y, 0.3)
    o.scale.setScalar(Math.max(s.s, 0.001))
    o.visible = s.s > 0.01
    if (gone) {
      if (s.s < 0.02 && !s.reported) {
        s.reported = true
        onGone(brace.key)
      }
    } else s.reported = false
  })
  return (
    <group ref={g}>
      <Line points={points} color={NOTE_COLOR} lineWidth={2.2} />
      <group position={[0, sign * (r + 0.27), 0]}>
        <DomTag text={brace.text} className={cls('bench-note', alive)} zIndex={21} />
      </group>
    </group>
  )
}

function DividerMesh({ div, alive, gone, onGone }: { div: LayoutDivider; alive: boolean; gone: boolean; onGone: (key: string) => void }) {
  const g = useRef<Group>(null)
  const points = useMemo<[number, number, number][]>(() => [[0, div.y0, 0], [0, div.y1, 0]], [div.y0, div.y1])
  const a = useRef({ s: 0, x: div.x, placed: false, reported: false })
  useFrame((_, delta) => {
    const o = g.current
    if (!o) return
    const dt = Math.min(delta, 0.05)
    const s = a.current
    if (!s.placed) {
      s.x = div.x
      s.placed = true
    } else easing.damp(s, 'x', div.x, SMOOTH, dt)
    easing.damp(s, 's', alive ? 1 : 0, SMOOTH, dt)
    o.position.set(s.x, 0, 0)
    o.scale.set(1, Math.max(s.s, 0.001), 1)
    o.visible = s.s > 0.01
    if (gone) {
      if (s.s < 0.02 && !s.reported) {
        s.reported = true
        onGone(div.key)
      }
    } else s.reported = false
  })
  return (
    <group ref={g}>
      <Line points={points} color="#cf222e" lineWidth={2} dashed dashSize={0.12} gapSize={0.09} />
      <group position={[0, div.y1 + 0.25, 0]}>
        <DomTag text={div.text ?? ''} className={cls('bench-divider', alive && !!div.text)} zIndex={21} />
      </group>
    </group>
  )
}

// ---------- 整行 ----------
function toMap<T>(arr: readonly T[], keyOf: (t: T) => string): Map<string, T> {
  return new Map(arr.map((t) => [keyOf(t), t] as const))
}

export function Bench3D({ obj, compact = false }: { obj: ObjectState; compact?: boolean }) {
  const bench = obj.bench!
  const layout: BenchLayout = useMemo(() => layoutBench(bench, compact), [bench, compact])
  const vis = obj.visible
  const root = useRef<Group>(null)
  const target = useMemo(() => new Vector3(...obj.position), [obj.position])
  const placed = useRef(false)

  const items = useRetained(useMemo(() => toMap(layout.items, (i) => i.id), [layout]))
  const slots = useRetained(useMemo(() => toMap(layout.slots, (s) => `c${s.index}`), [layout]))
  const gaps = useRetained(useMemo(() => toMap(layout.gaps, (g) => g.key), [layout]))
  const braces = useRetained(useMemo(() => toMap(layout.braces, (b) => b.key), [layout]))
  const dividers = useRetained(useMemo(() => toMap(layout.dividers, (d) => d.key), [layout]))

  useFrame((_, delta) => {
    const g = root.current
    if (!g) return
    if (!placed.current) {
      g.position.copy(target)
      placed.current = true
    } else easing.damp3(g.position, target, SMOOTH, Math.min(delta, 0.05))
  })

  const labelY = bench.countLabel ? layout.countY : 0.35
  const rem = layout.remainder
  return (
    <group ref={root}>
      {slots.list.map(({ key, data, gone }) => (
        <ContainerMesh key={key} slot={data} countY={layout.countY} alive={vis && !gone} gone={gone} onGone={slots.drop} />
      ))}
      {gaps.list.map(({ key, data, gone }) => (
        <GapMarks key={key} id={key} x={data.x} y={bench.countLabel ? layout.countY - 0.02 : 0.2} alive={vis && !gone} gone={gone} onGone={gaps.drop} />
      ))}
      {items.list.map(({ key, data, gone }) => (
        <ItemMesh key={key} item={data} alive={vis && !gone} gone={gone} onGone={items.drop} />
      ))}
      {braces.list.map(({ key, data, gone }) => (
        <BraceMesh key={key} brace={data} alive={vis && !gone} gone={gone} onGone={braces.drop} />
      ))}
      {dividers.list.map(({ key, data, gone }) => (
        <DividerMesh key={key} div={data} alive={vis && !gone} gone={gone} onGone={dividers.drop} />
      ))}
      {layout.label && (
        <group position={[layout.label.x, labelY, 0]}>
          <DomTag text={layout.label.text} className={cls('bench-label', vis)} zIndex={22} />
        </group>
      )}
      <group position={[rem?.x ?? 0, rem?.y ?? 0, 0]}>
        <DomTag
          text={rem?.text ?? ''}
          className={cls(`bench-rem ${rem?.type ?? 'extra'}`, vis && !!rem)}
          color={rem ? REMAINDER_COLOR[rem.type] : undefined}
          zIndex={22}
        />
      </group>
      {/* 老师划掉的旧文字（灰字 + 红删除线）：在新文字正上方，出现时渐入 */}
      <group position={[rem?.x ?? 0, rem?.wasY ?? 0, 0]}>
        <DomTag text={rem?.was ?? ''} className={cls('bench-was', vis && !!rem?.was)} zIndex={21} />
      </group>
    </group>
  )
}

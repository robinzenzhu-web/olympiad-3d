import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { ConeGeometry, CylinderGeometry, MeshStandardMaterial, Quaternion, Vector3, type Group, type Mesh } from 'three'
import * as easing from 'maath/easing'
import { arrowEnds, type ObjectState } from '../engine/state'
import { ARROW_GAP_PX, arrowLabelPlacement, TEXT_AT_T } from '../engine/arrowLabel'
import { SMOOTH } from './CellGroup'
import { DomTag } from './DomTag'

const SHAFT = new CylinderGeometry(0.03, 0.03, 1, 10)
const HEAD = new ConeGeometry(0.09, 1, 14)
const UP = new Vector3(0, 1, 0)

/** 细箭头 + 文字（"差 16+10"、"每份差 2" 这类标注）。起点 = obj.position，终点 = obj.arrow.to，都会阻尼移动 */
export function Arrow3D({ obj, compact = false }: { obj: ObjectState; compact?: boolean }) {
  const arrow = obj.arrow!
  const color = arrow.color
  const shaft = useRef<Mesh>(null)
  const head = useRef<Mesh>(null)
  const label = useRef<Group>(null)
  const mat = useMemo(() => new MeshStandardMaterial({ color, roughness: 0.5, transparent: true }), [color])
  useEffect(() => () => mat.dispose(), [mat])

  const ends = useMemo(() => arrowEnds(obj, compact), [obj, compact])
  const tFrom = useMemo(() => new Vector3(...ends.from), [ends])
  const tTo = useMemo(() => new Vector3(...ends.to), [ends])
  const cur = useRef({ from: tFrom.clone(), to: tTo.clone(), s: 0, placed: false })
  const tmp = useMemo(() => ({ dir: new Vector3(), q: new Quaternion() }), [])

  useFrame((_, delta) => {
    const c = cur.current
    const dt = Math.min(delta, 0.05)
    if (!c.placed) {
      c.from.copy(tFrom)
      c.to.copy(tTo)
      c.placed = true
    } else {
      easing.damp3(c.from, tFrom, SMOOTH, dt)
      easing.damp3(c.to, tTo, SMOOTH, dt)
    }
    easing.damp(c, 's', obj.visible ? 1 : 0, SMOOTH, dt)
    const sh = shaft.current
    const hd = head.current
    if (!sh || !hd) return
    const show = c.s > 0.02
    sh.visible = hd.visible = show
    mat.opacity = Math.min(1, c.s)
    tmp.dir.subVectors(c.to, c.from)
    const len = tmp.dir.length()
    if (len < 1e-4) return
    tmp.dir.divideScalar(len)
    tmp.q.setFromUnitVectors(UP, tmp.dir)
    const headLen = Math.min(0.26, len * 0.4) * c.s
    const shaftLen = Math.max(len - headLen, 0.001) * (0.2 + 0.8 * c.s)
    sh.quaternion.copy(tmp.q)
    hd.quaternion.copy(tmp.q)
    sh.position.copy(c.from).addScaledVector(tmp.dir, shaftLen / 2)
    sh.scale.set(1, shaftLen, 1)
    hd.position.copy(c.from).addScaledVector(tmp.dir, shaftLen + headLen / 2)
    hd.scale.set(1, Math.max(headLen, 0.001), 1)
    // 文字锁定在箭身上 textAt 指定的位置（起点 / 中点 / 箭头附近），文字框的边缘贴着箭身（DomTag 的 anchor），所以再长也不会压在箭身上
    label.current?.position.copy(c.from).lerp(c.to, TEXT_AT_T[arrow.textAt])
  })
  // 文字在箭身哪一侧：由终点状态算（过渡中不跳动）
  const anchor = useMemo(() => arrowLabelPlacement(ends.from, ends.to, arrow.textAt, arrow.textSide).anchor, [ends, arrow.textAt, arrow.textSide])

  const on = obj.visible && !!obj.text
  return (
    <group>
      <mesh ref={shaft} geometry={SHAFT} material={mat} raycast={() => null} />
      <mesh ref={head} geometry={HEAD} material={mat} raycast={() => null} />
      <group ref={label}>
        <DomTag text={obj.text ?? ''} className={`bt arrow-text${on ? ' on' : ''}`} color={color} zIndex={23} anchor={anchor} gapPx={ARROW_GAP_PX} />
      </group>
    </group>
  )
}

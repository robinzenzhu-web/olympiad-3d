import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3, type Group } from 'three'
import * as easing from 'maath/easing'
import type { ObjectState } from '../engine/state'
import { SMOOTH } from './CellGroup'
import { DomTag } from './DomTag'

/** 3D 空间中的文字标注（跟随 3D 位置的 HTML 标签）：位置阻尼移动，显隐用 CSS 渐变 */
export function Label3D({ obj }: { obj: ObjectState }) {
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

  const on = obj.visible && !!obj.text
  return (
    <group ref={group}>
      <DomTag text={obj.text ?? ''} className={on ? 'label3d on' : 'label3d'} zIndex={10} />
    </group>
  )
}

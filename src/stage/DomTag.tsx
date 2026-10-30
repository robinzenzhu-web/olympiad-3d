import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type Group } from 'three'

interface Props {
  text: string
  /** 内层元素的 class（动画/外观由 CSS 决定） */
  className: string
  /** CSS animation-delay，用于 stagger 弹出 */
  delayMs?: number
  zIndex?: number
  /** 文字颜色（可选，不写则由 CSS class 决定） */
  color?: string
  /**
   * 文字框相对 3D 点的位置：center（默认，框中心在点上）；left = 点贴着框的左边缘（文字伸向右边）；
   * right = 点贴着框的右边缘；above = 点在框的下边缘（文字在点上方）；below = 点在框的上边缘。
   * 非 center 时会留 gapPx 的空隙，这样文字再长也不会压到点所在的物体。
   */
  anchor?: 'center' | 'left' | 'right' | 'above' | 'below'
  gapPx?: number
}

const tmp = new Vector3()

function anchorShift(anchor: NonNullable<Props['anchor']>, gap: number): string {
  switch (anchor) {
    case 'left':
      return `translate(${gap}px,-50%)`
    case 'right':
      return `translate(calc(-100% - ${gap}px),-50%)`
    case 'above':
      return `translate(-50%,calc(-100% - ${gap}px))`
    case 'below':
      return `translate(-50%,${gap}px)`
    default:
      return 'translate(-50%,-50%)'
  }
}

/**
 * 跟随 3D 位置的 HTML 小标签（数字圆标、Label）。
 * 不使用 drei <Html>：它在卸载时会同步 unmount 一个 React root，
 * 在 React 19 下会在切换题目/返回列表时报错。这里用原生 DOM + 每帧投影，卸载安全。
 * 必须放在某个 3D 对象（group）里，位置取其世界坐标。
 */
export function DomTag({ text, className, delayMs = 0, zIndex = 20, color, anchor = 'center', gapPx = 8 }: Props) {
  const shift = anchorShift(anchor, gapPx)
  const group = useRef<Group>(null)
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const [outer, inner] = useMemo(() => {
    const o = document.createElement('div')
    o.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;will-change:transform;visibility:hidden;'
    const i = document.createElement('div')
    o.appendChild(i)
    return [o, i] as const
  }, [])

  useLayoutEffect(() => {
    const parent = gl.domElement.parentElement
    parent?.appendChild(outer)
    return () => outer.remove()
  }, [gl, outer])

  useLayoutEffect(() => {
    inner.className = className
    inner.textContent = text
    inner.style.animationDelay = delayMs ? `${delayMs}ms` : ''
    inner.style.color = color ?? ''
    outer.style.zIndex = String(zIndex)
  }, [inner, outer, className, text, delayMs, zIndex, color])

  useFrame(() => {
    const g = group.current
    if (!g) return
    g.updateWorldMatrix(true, false)
    tmp.setFromMatrixPosition(g.matrixWorld).project(camera)
    const x = (tmp.x * 0.5 + 0.5) * size.width
    const y = (-tmp.y * 0.5 + 0.5) * size.height
    outer.style.transform = `translate3d(${x}px,${y}px,0) ${shift}`
    outer.style.visibility = Math.abs(tmp.z) > 1 ? 'hidden' : 'visible'
  })

  return <group ref={group} />
}

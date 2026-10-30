import { useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { isCompactWidth, sceneFitInfo } from '../engine/fit'
import { sceneRadiusAt, type ResolvedCamera, type SceneState } from '../engine/state'
import { Arrow3D } from './Arrow3D'
import { Bench3D } from './Bench3D'
import { CameraRig } from './CameraRig'
import { CubeGrid } from './CubeGrid'
import { CubeStack } from './CubeStack'
import { Label3D } from './Label3D'

interface Props {
  state: SceneState
  camera: ResolvedCamera
  autoRotate: boolean
  resetToken: number
  /** 相机规格对应的基准半径（题目初始场景的半径） */
  baseRadius: number
}

/** 3D 舞台：只负责把 SceneState「平滑过渡」地画出来，自己不保存任何业务状态 */
export function Stage(props: Props) {
  return (
    <Canvas camera={{ position: props.camera.position, fov: 40, near: 0.1, far: 200 }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={['#fafaf7']} />
      <ambientLight intensity={1.4} />
      <directionalLight position={[6, 9, 7]} intensity={1.7} />
      <directionalLight position={[-6, -4, -5]} intensity={0.6} />
      <Scene {...props} />
    </Canvas>
  )
}

/** Canvas 里面的内容：需要画布宽度（窄屏 compact 判定），所以放在 Canvas 之内 */
function Scene({ state, camera, autoRotate, resetToken, baseRadius }: Props) {
  // 窄屏（手机竖屏）：Bench 用 compactShow 少显示几份、Arrow 用 compactOffset，文字才能大一点
  const compact = useThree((s) => isCompactWidth(s.size.width))
  const radius = useMemo(() => sceneRadiusAt(state, compact), [state, compact])
  const fit = useMemo(() => sceneFitInfo(state, compact), [state, compact])
  return (
    <>
      <CameraRig camera={camera} autoRotate={autoRotate} resetToken={resetToken} radius={radius} baseRadius={baseRadius} fit={fit?.rects ?? null} fitLabelPx={fit?.labelPx ?? 0} />
      {state.order.map((id) => {
        const obj = state.objects[id]!
        if (obj.type === 'CubeGrid') return <CubeGrid key={id} obj={obj} />
        if (obj.type === 'CubeStack') return <CubeStack key={id} obj={obj} />
        if (obj.type === 'Bench') return <Bench3D key={id} obj={obj} compact={compact} />
        if (obj.type === 'Arrow') return <Arrow3D key={id} obj={obj} compact={compact} />
        return <Label3D key={id} obj={obj} />
      })}
    </>
  )
}

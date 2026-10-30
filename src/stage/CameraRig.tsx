import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraControls, CameraControlsImpl, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import type { Camera, OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { radiusScale, type ResolvedCamera } from '../engine/state'
import type { Projection } from '../schema/problem'
import { adaptiveTextScale, fitCamera, scaleFitPads, textScale, type FitOptions, type FitRect } from '../engine/fit'

const AUTO_ROTATE_SPEED = 0.22 // rad/s，缓慢自转
const AUTO_ROTATE_DELAY_MS = 900 // 步骤切换后等镜头过渡结束再开始转

const FOV = 40 // 透视相机垂直视角（度）
const NEAR = 0.1
const FAR = 200
const MIN_DISTANCE = 2
const MAX_DISTANCE = 45
const HALF_TAN = Math.tan((FOV * Math.PI) / 360)
/** Bench 自动取景时的最大俯仰角（3°） */
const FIT_MAX_ELEVATION = (3 * Math.PI) / 180

/** 竖屏/窄屏时把相机拉远一点，避免立方体被裁掉 */
function fitFactor(width: number, height: number): number {
  const aspect = width / Math.max(height, 1)
  return Math.min(1.7, Math.max(1, 0.95 / aspect))
}

/**
 * 正交相机的 zoom 与「等效透视距离」互换：
 * 正交视野高度 = 画布高度(px) / zoom；透视在距离 D 处的视野高度 = 2·D·tan(fov/2)。
 * 令两者相等，则同一个目标距离 D 在两种投影下画面里物体大小大致相当。
 */
function zoomForDistance(distance: number, height: number): number {
  return Math.max(height, 1) / (2 * distance * HALF_TAN)
}
function distanceForZoom(zoom: number, height: number): number {
  return Math.max(height, 1) / (2 * zoom * HALF_TAN)
}

const isOrtho = (cam: Camera): cam is ThreeOrthographicCamera => (cam as ThreeOrthographicCamera).isOrthographicCamera === true

/**
 * 相机规格下的目标距离 = 规格距离 × fit × (当前半径 / 基准半径)，并夹在 [MIN_DISTANCE, MAX_DISTANCE]。
 * 透视：dolly 到该距离；正交：位置照常放，另把 zoom 设成与该距离等效。返回实际采用的目标距离。
 */
function applyCamera(
  c: CameraControlsImpl,
  cam: ResolvedCamera,
  fit: number,
  scale: number,
  height: number,
  animate: boolean,
): number {
  const [tx, ty, tz] = cam.target
  const [px, py, pz] = cam.position
  const specDist = Math.hypot(px - tx, py - ty, pz - tz)
  const k = specDist > 0 ? Math.min(c.maxDistance, Math.max(c.minDistance, specDist * fit * scale)) / specDist : fit * scale
  void c.setLookAt(tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k, tx, ty, tz, animate)
  const distance = specDist * k
  if (isOrtho(c.camera)) void c.zoomTo(zoomForDistance(distance, height), animate)
  return distance
}

interface Props {
  camera: ResolvedCamera
  autoRotate: boolean
  /** 每点一次「重置视角」+1 */
  resetToken: number
  /** 场景包围半径：变大（拆开 / explore 放大）时自动把相机拉远，变小则拉近 */
  radius: number
  /** 相机规格对应的基准半径（题目初始场景的半径）：距离 = 规格距离 × fit × radius / baseRadius */
  baseRadius: number
  /**
   * 板凳模型（Bench）场景的自动取景内容（见 engine/fit.ts）。非 null 时：相机目标点 / 距离由程序算，
   * 作者写的 camera 只用来决定观察方向；不再按 radius 缩放、也不再用竖屏 fitFactor。仅透视相机生效。
   */
  fit: FitRect[] | null
  /** 自动取景时，每份上方最宽的文字（缩放 1 倍的像素宽，见 sceneFitInfo）；不写 = 只按画布宽度缩放文字 */
  fitLabelPx?: number
}

/** 默认相机的标记：CameraRig 只在默认相机已换成目标投影的相机后才挂载控制器 */
const TAG: Record<Projection, { stageProjection: Projection }> = {
  perspective: { stageProjection: 'perspective' },
  orthographic: { stageProjection: 'orthographic' },
}

/** 按投影类型提供默认相机；切换投影时整个相机对象（连同控制器）重建，直接跳变 */
function ProjectionCamera({ projection, position }: { projection: Projection; position: ResolvedCamera['position'] }) {
  // 只取挂载时的位置：之后位置完全由 CameraControls 管理，不能被 React 重新覆盖
  const initial = useRef(position).current
  return projection === 'orthographic' ? (
    <OrthographicCamera makeDefault position={initial} near={NEAR} far={FAR} userData={TAG.orthographic} />
  ) : (
    <PerspectiveCamera makeDefault position={initial} fov={FOV} near={NEAR} far={FAR} userData={TAG.perspective} />
  )
}

export function CameraRig(props: Props) {
  const projection = props.camera.projection
  const active = useThree((s) => s.camera)
  const ready = (active.userData as { stageProjection?: Projection }).stageProjection === projection
  return (
    <>
      <ProjectionCamera key={projection} projection={projection} position={props.camera.position} />
      {/* 以相机 uuid 为 key：相机对象一变就整体重建控制器，避免控制器还指着旧相机 */}
      {ready && <Rig key={active.uuid} {...props} three={active as ThreePerspectiveCamera | ThreeOrthographicCamera} />}
    </>
  )
}

/** 自动取景：用 spec 的观察方向，按内容算目标点和距离（数值取整到 0.01，避免像素级抖动重新触发相机过渡） */
function fitOptions(width: number, height: number): FitOptions {
  return { width, height, fov: FOV, minDist: Math.max(MIN_DISTANCE, 6.5), maxDist: MAX_DISTANCE }
}

function fittedCamera(cam: ResolvedCamera, rects: FitRect[], width: number, height: number, tScale: number): ResolvedCamera {
  const { center, dist } = fitCamera(scaleFitPads(rects, tScale), fitOptions(width, height))
  let dir = [cam.position[0] - cam.target[0], cam.position[1] - cam.target[1], cam.position[2] - cam.target[2]]
  // 板凳图是“上下两行要对齐”的示意图：俯角太大时下面一行离相机更远、透视下会略微往中间挤，两行的份就对不齐了，所以限制最大俯仰角
  const horiz = Math.hypot(dir[0]!, dir[2]!)
  if (horiz > 1e-6) {
    const el = Math.max(-FIT_MAX_ELEVATION, Math.min(FIT_MAX_ELEVATION, Math.atan2(dir[1]!, horiz)))
    const L = Math.hypot(dir[0]!, dir[1]!, dir[2]!)
    dir = [(dir[0]! / horiz) * Math.cos(el) * L, Math.sin(el) * L, (dir[2]! / horiz) * Math.cos(el) * L]
  }
  const len = Math.hypot(dir[0]!, dir[1]!, dir[2]!) || 1
  const r = (v: number) => Math.round(v * 100) / 100
  const target: ResolvedCamera['target'] = [r(center[0]), r(center[1]), 0]
  return {
    ...cam,
    target,
    position: [r(target[0] + (dir[0]! / len) * dist), r(target[1] + (dir[1]! / len) * dist), r(target[2] + (dir[2]! / len) * dist)],
  }
}

function Rig({ camera: specCamera, autoRotate, resetToken, radius, baseRadius, fit: fitRects, fitLabelPx = 0, three }: Props & { three: ThreePerspectiveCamera | ThreeOrthographicCamera }) {
  const controls = useRef<CameraControlsImpl>(null)
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const ortho = specCamera.projection === 'orthographic'
  // 3D 文字随画布宽度缩小（CSS 变量 --bs，见 styles.css 的 .bt），手机上才不会互相压在一起
  // 含 Bench 的自动取景场景：每份上方的文字比份间距还宽时（行很长），再多缩一点，免得相邻的字互相压住
  const tScale = useMemo(() => {
    const base = textScale(size.width)
    return fitRects && !ortho ? adaptiveTextScale(fitRects, fitLabelPx, fitOptions(size.width, size.height), base) : base
  }, [fitRects, fitLabelPx, ortho, size.width, size.height])
  useEffect(() => {
    gl.domElement.parentElement?.style.setProperty('--bs', String(tScale))
  }, [gl, tScale])
  // 含 Bench 的场景：自动取景（透视）。此时距离已是精确值，不再乘 fitFactor / radiusScale
  const camera = useMemo(
    () => (fitRects && !ortho ? fittedCamera(specCamera, fitRects, size.width, size.height, tScale) : specCamera),
    [fitRects, ortho, specCamera, size.width, size.height, tScale],
  )
  const autoFit = !!fitRects && !ortho
  const autoFitRef = useRef(autoFit)
  autoFitRef.current = autoFit
  const fit = useRef(1)
  fit.current = autoFit ? 1 : fitFactor(size.width, size.height)
  const heightRef = useRef(size.height)
  heightRef.current = size.height

  const latest = useRef(camera)
  latest.current = camera
  const appliedKey = useRef<string | null>(null)
  const dragging = useRef(false)
  const rotateAfter = useRef(0)

  const camKey = JSON.stringify(camera)
  const radiusRef = useRef(radius)
  radiusRef.current = radius
  const baseRef = useRef(baseRadius)
  baseRef.current = baseRadius
  // 上一次相机距离对应的场景半径
  const radiusApplied = useRef(radius)
  // 目标距离（不是过渡中的当前距离）；用户手动缩放后为 null，改用当前距离
  // 正交相机下「距离」指与 zoom 等效的透视距离（见 zoomForDistance）
  const targetDistance = useRef<number | null>(null)

  const currentDistance = (c: CameraControlsImpl): number =>
    isOrtho(c.camera) ? distanceForZoom(c.camera.zoom, heightRef.current) : c.distance

  // 正交缩放范围 = 与 [MIN_DISTANCE, MAX_DISTANCE] 等效的 zoom；画布高度变化时按比例保持视野
  const lastHeight = useRef(size.height)
  useEffect(() => {
    const c = controls.current
    if (!c || !ortho) return
    c.minZoom = zoomForDistance(MAX_DISTANCE, size.height)
    c.maxZoom = zoomForDistance(MIN_DISTANCE, size.height)
    if (lastHeight.current !== size.height && appliedKey.current !== null) {
      void c.zoomTo(c.camera.zoom * (size.height / Math.max(lastHeight.current, 1)), false)
    }
    lastHeight.current = size.height
  }, [ortho, size.height])

  // 相机目标变化（步骤切换）：平滑过渡；首次直接就位
  useEffect(() => {
    const c = controls.current
    if (!c || appliedKey.current === camKey) return
    targetDistance.current = applyCamera(
      c,
      latest.current,
      fit.current,
      autoFitRef.current ? 1 : radiusScale(radiusRef.current, baseRef.current),
      heightRef.current,
      appliedKey.current !== null,
    )
    appliedKey.current = camKey
    radiusApplied.current = radiusRef.current
    rotateAfter.current = performance.now() + AUTO_ROTATE_DELAY_MS
  }, [camKey])

  // 场景大小变化（不是由换相机引起的）：按比例缩放相机距离，保留用户当前的视角方向
  useEffect(() => {
    const c = controls.current
    if (!c || appliedKey.current === null) return
    if (autoFitRef.current) {
      radiusApplied.current = radius
      return
    }
    const prev = radiusApplied.current
    if (prev <= 0 || radius <= 0 || Math.abs(radius - prev) < 1e-6) return
    radiusApplied.current = radius
    const next = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, (targetDistance.current ?? currentDistance(c)) * (radius / prev)))
    targetDistance.current = next
    void c.dollyTo(next, true)
    if (isOrtho(c.camera)) void c.zoomTo(zoomForDistance(next, heightRef.current), true)
  }, [radius])

  // 重置视角
  const firstReset = useRef(resetToken)
  useEffect(() => {
    const c = controls.current
    if (!c || resetToken === firstReset.current) return
    firstReset.current = resetToken
    targetDistance.current = applyCamera(
      c,
      latest.current,
      fit.current,
      autoFitRef.current ? 1 : radiusScale(radiusRef.current, baseRef.current),
      heightRef.current,
      true,
    )
    radiusApplied.current = radiusRef.current
    rotateAfter.current = performance.now() + AUTO_ROTATE_DELAY_MS
  }, [resetToken])

  // 交互限制：只保留旋转与缩放（不平移，避免孩子把模型拖丢）；记录是否正在拖动
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const A = CameraControlsImpl.ACTION
    c.mouseButtons.right = A.NONE
    if (ortho) {
      // 正交相机里 dolly 不改变画面大小，滚轮 / 中键 / 双指都改用 zoom
      c.mouseButtons.wheel = A.ZOOM
      c.mouseButtons.middle = A.ZOOM
      c.touches.two = A.TOUCH_ZOOM
    } else {
      c.touches.two = A.TOUCH_DOLLY
    }
    c.touches.three = A.NONE
    const start = () => {
      dragging.current = true
    }
    const end = () => {
      dragging.current = false
      targetDistance.current = null
      rotateAfter.current = performance.now() + 1500
    }
    c.addEventListener('controlstart', start)
    c.addEventListener('controlend', end)
    return () => {
      c.removeEventListener('controlstart', start)
      c.removeEventListener('controlend', end)
    }
  }, [ortho])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c || !autoRotate || dragging.current) return
    if (performance.now() < rotateAfter.current) return
    void c.rotate(Math.min(delta, 0.05) * AUTO_ROTATE_SPEED, 0, false)
  })

  return (
    <CameraControls
      ref={controls}
      camera={three}
      makeDefault
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      smoothTime={0.35}
      draggingSmoothTime={0.08}
    />
  )
}

import { create } from 'zustand'

/** 播放器的界面状态（当前步、quiz 作答、explore 滑块值）。3D 场景状态不放这里，由 engine.computeStates 推导。 */
interface PlayerStore {
  problemId: string | null
  total: number
  step: number
  /** quiz：步骤下标 → 选了第几项 */
  quiz: Record<number, number>
  /** explore：步骤下标 → 滑块当前值 */
  explore: Record<number, number>
  /** 「重置视角」点击次数 */
  camReset: number
  open: (problemId: string, total: number) => void
  close: () => void
  goto: (i: number) => void
  next: () => void
  prev: () => void
  answer: (step: number, option: number) => void
  setExplore: (step: number, value: number) => void
  resetCamera: () => void
}

export const usePlayer = create<PlayerStore>((set, get) => ({
  problemId: null,
  total: 0,
  step: 0,
  quiz: {},
  explore: {},
  camReset: 0,
  open: (problemId, total) => set({ problemId, total, step: 0, quiz: {}, explore: {}, camReset: 0 }),
  close: () => set({ problemId: null, total: 0, step: 0, quiz: {}, explore: {}, camReset: 0 }),
  goto: (i) => set((s) => ({ step: Math.min(Math.max(0, Math.round(i)), Math.max(0, s.total - 1)) })),
  next: () => get().goto(get().step + 1),
  prev: () => get().goto(get().step - 1),
  answer: (step, option) => set((s) => ({ quiz: { ...s.quiz, [step]: option } })),
  setExplore: (step, value) => set((s) => ({ explore: { ...s.explore, [step]: value } })),
  resetCamera: () => set((s) => ({ camReset: s.camReset + 1 })),
}))

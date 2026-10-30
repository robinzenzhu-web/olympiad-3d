import { Component, type ReactNode } from 'react'

/** 3D 舞台出错（如浏览器不支持 WebGL）时显示提示，而不是整页白屏；讲解卡片仍可使用 */
export class StageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="stage-error">
          <strong>3D 画面无法显示</strong>
          <p>可能是浏览器不支持 WebGL，或显卡驱动有问题。讲解文字仍然可以正常阅读。</p>
          <code>{this.state.error.message}</code>
        </div>
      )
    }
    return this.props.children
  }
}

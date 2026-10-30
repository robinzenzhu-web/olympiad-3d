/** 引擎共用的错误类型（单独成文件，避免 validate.ts 与 bench.ts 循环引用） */

export interface Issue {
  /** 0 起的步骤下标；undefined 表示不属于某一步（如 scene） */
  step?: number
  /** 出错字段的路径，如 "actions[1].target" */
  field: string
  message: string
}

export class ProblemError extends Error {
  readonly issue: Issue
  constructor(issue: Issue) {
    super(`${issue.step !== undefined ? `第 ${issue.step + 1} 步：` : ''}${issue.field}：${issue.message}`)
    this.name = 'ProblemError'
    this.issue = issue
  }
}

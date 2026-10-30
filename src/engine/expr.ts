/**
 * expr.ts —— 安全表达式：递归下降解析 + 求值。
 * 只支持：数字、变量名、+ - * / ^、括号、一元负号。
 * 不使用 eval / new Function，也不支持函数调用、属性访问等任何其他语法。
 *
 * 文法（优先级从低到高）：
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := '-' unary | power
 *   power  := atom ('^' unary)?          // 右结合：2^3^2 = 2^(3^2)；-2^2 = -(2^2)
 *   atom   := NUMBER | IDENT | '(' expr ')'
 */

export class ExprError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExprError'
  }
}

export type ExprNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; e: ExprNode }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; l: ExprNode; r: ExprNode }

type Token =
  | { k: 'num'; v: number; pos: number }
  | { k: 'id'; v: string; pos: number }
  | { k: 'op'; v: string; pos: number }
  | { k: 'end'; pos: number }

const MAX_LEN = 200
const MAX_DEPTH = 50

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
    } else if (/[0-9.]/.test(ch)) {
      const m = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(src.slice(i))
      if (!m) throw new ExprError(`第 ${i + 1} 个字符处的数字写法不对："${src.slice(i, i + 5)}"`)
      out.push({ k: 'num', v: Number(m[0]), pos: i })
      i += m[0].length
    } else if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!
      out.push({ k: 'id', v: m[0], pos: i })
      i += m[0].length
    } else if ('+-*/^()'.includes(ch)) {
      out.push({ k: 'op', v: ch, pos: i })
      i++
    } else {
      throw new ExprError(`第 ${i + 1} 个字符 "${ch}" 不能用在表达式里（只能用数字、变量、+ - * / ^ 和括号）`)
    }
  }
  out.push({ k: 'end', pos: src.length })
  return out
}

function describe(t: Token): string {
  return t.k === 'end' ? '表达式结尾' : t.k === 'num' ? `数字 ${t.v}` : `"${t.v}"`
}

class Parser {
  private i = 0
  private depth = 0
  constructor(private readonly toks: Token[]) {}

  private peek(): Token {
    return this.toks[this.i]!
  }
  private next(): Token {
    return this.toks[this.i++]!
  }
  private isOp(v: string): boolean {
    const t = this.peek()
    return t.k === 'op' && t.v === v
  }

  parse(): ExprNode {
    const node = this.expr()
    const t = this.peek()
    if (t.k !== 'end') {
      throw new ExprError(`第 ${t.pos + 1} 个字符处多出了 ${describe(t)}（不支持函数调用，也不能省略乘号）`)
    }
    return node
  }

  private enter(): void {
    if (++this.depth > MAX_DEPTH) throw new ExprError('表达式嵌套太深')
  }
  private leave(): void {
    this.depth--
  }

  private expr(): ExprNode {
    this.enter()
    let l = this.term()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { v: '+' | '-' }).v
      l = { t: 'bin', op, l, r: this.term() }
    }
    this.leave()
    return l
  }

  private term(): ExprNode {
    let l = this.unary()
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.next() as { v: '*' | '/' }).v
      l = { t: 'bin', op, l, r: this.unary() }
    }
    return l
  }

  private unary(): ExprNode {
    if (this.isOp('-')) {
      this.next()
      this.enter()
      const e = this.unary()
      this.leave()
      return { t: 'neg', e }
    }
    return this.power()
  }

  private power(): ExprNode {
    const base = this.atom()
    if (this.isOp('^')) {
      this.next()
      this.enter()
      const exp = this.unary()
      this.leave()
      return { t: 'bin', op: '^', l: base, r: exp }
    }
    return base
  }

  private atom(): ExprNode {
    const t = this.next()
    if (t.k === 'num') return { t: 'num', v: t.v }
    if (t.k === 'id') return { t: 'var', name: t.v }
    if (t.k === 'op' && t.v === '(') {
      const e = this.expr()
      const close = this.next()
      if (!(close.k === 'op' && close.v === ')')) {
        throw new ExprError(`缺少右括号 ")"（在第 ${close.pos + 1} 个字符处遇到 ${describe(close)}）`)
      }
      return e
    }
    throw new ExprError(`第 ${t.pos + 1} 个字符处这里应该是数字、变量或左括号，但遇到了 ${describe(t)}`)
  }
}

/** 解析表达式为 AST；非法输入抛 ExprError */
export function parseExpr(src: string): ExprNode {
  if (typeof src !== 'string') throw new ExprError('表达式必须是字符串')
  if (src.trim() === '') throw new ExprError('表达式不能为空')
  if (src.length > MAX_LEN) throw new ExprError(`表达式太长（最多 ${MAX_LEN} 个字符）`)
  return new Parser(tokenize(src)).parse()
}

export type Vars = Readonly<Record<string, number>>

/** 对 AST 求值；未定义变量 / 除以 0 / 结果非有限数都会抛 ExprError */
export function evalNode(node: ExprNode, vars: Vars = {}): number {
  switch (node.t) {
    case 'num':
      return node.v
    case 'var': {
      if (!Object.prototype.hasOwnProperty.call(vars, node.name)) {
        throw new ExprError(`变量 "${node.name}" 没有定义`)
      }
      return vars[node.name]!
    }
    case 'neg':
      return -evalNode(node.e, vars)
    case 'bin': {
      const a = evalNode(node.l, vars)
      const b = evalNode(node.r, vars)
      let r: number
      switch (node.op) {
        case '+':
          r = a + b
          break
        case '-':
          r = a - b
          break
        case '*':
          r = a * b
          break
        case '/':
          if (b === 0) throw new ExprError('除数不能是 0')
          r = a / b
          break
        case '^':
          r = Math.pow(a, b)
          break
      }
      if (!Number.isFinite(r)) throw new ExprError('计算结果不是有限的数')
      return r
    }
  }
}

/** 解析并求值 */
export function evaluate(src: string, vars: Vars = {}): number {
  return evalNode(parseExpr(src), vars)
}

/** 表达式用到的所有变量名（去重） */
export function collectVars(node: ExprNode, acc: Set<string> = new Set()): Set<string> {
  switch (node.t) {
    case 'var':
      acc.add(node.name)
      break
    case 'neg':
      collectVars(node.e, acc)
      break
    case 'bin':
      collectVars(node.l, acc)
      collectVars(node.r, acc)
      break
    case 'num':
      break
  }
  return acc
}

// ---------- 模板：把 {{expr}} 替换为数值 ----------
const TEMPLATE_RE = /\{\{([^{}]*)\}\}/g

/** 数值显示：最多 6 位小数，去掉多余的 0 */
export function formatNumber(n: number): string {
  const r = Math.round(n * 1e6) / 1e6
  return Object.is(r, -0) ? '0' : String(r)
}

/** 取出模板里所有 {{...}} 中的表达式源码 */
export function templateExprs(template: string): string[] {
  return Array.from(template.matchAll(TEMPLATE_RE), (m) => m[1]!)
}

/** 渲染模板：每个 {{expr}} 用安全表达式求值后替换；求值失败抛 ExprError */
export function renderTemplate(template: string, vars: Vars): string {
  return template.replace(TEMPLATE_RE, (_m, src: string) => formatNumber(evaluate(src, vars)))
}

import { describe, expect, it } from 'vitest'
import { ExprError, collectVars, evaluate, formatNumber, parseExpr, renderTemplate, templateExprs } from '../src/engine/expr'

describe('expr 求值', () => {
  it('数字与四则运算', () => {
    expect(evaluate('1+2')).toBe(3)
    expect(evaluate('7-10')).toBe(-3)
    expect(evaluate('6*7')).toBe(42)
    expect(evaluate('9/4')).toBe(2.25)
    expect(evaluate('.5 + 1.25')).toBe(1.75)
  })

  it('优先级：乘除高于加减', () => {
    expect(evaluate('2+3*4')).toBe(14)
    expect(evaluate('2*3+4')).toBe(10)
    expect(evaluate('10-4/2')).toBe(8)
    expect(evaluate('10-4-3')).toBe(3) // 左结合
    expect(evaluate('100/10/5')).toBe(2)
  })

  it('括号', () => {
    expect(evaluate('(2+3)*4')).toBe(20)
    expect(evaluate('2*(3+4)*(1+1)')).toBe(28)
    expect(evaluate('((1))')).toBe(1)
  })

  it('^ 乘方：高于乘除，右结合', () => {
    expect(evaluate('2^3')).toBe(8)
    expect(evaluate('2*3^2')).toBe(18)
    expect(evaluate('2^3^2')).toBe(512)
    expect(evaluate('(2^3)^2')).toBe(64)
    expect(evaluate('2^-1')).toBe(0.5)
  })

  it('一元负号：-2^2 = -(2^2)', () => {
    expect(evaluate('-3')).toBe(-3)
    expect(evaluate('--3')).toBe(3)
    expect(evaluate('-2^2')).toBe(-4)
    expect(evaluate('(-2)^2')).toBe(4)
    expect(evaluate('5*-2')).toBe(-10)
    expect(evaluate('-(1+2)')).toBe(-3)
  })

  it('变量', () => {
    expect(evaluate('n', { n: 5 })).toBe(5)
    expect(evaluate('12*(n-2)', { n: 4 })).toBe(24)
    expect(evaluate('6*(n-2)^2', { n: 5 })).toBe(54)
    expect(evaluate('a*b + c', { a: 2, b: 3, c: 4 })).toBe(10)
    expect(evaluate('n_1 + _x', { n_1: 1, _x: 2 })).toBe(3)
  })

  it('collectVars', () => {
    expect([...collectVars(parseExpr('n*n + m - 2'))].sort()).toEqual(['m', 'n'])
  })
})

describe('expr 非法输入', () => {
  const bad = [
    '',
    '   ',
    '1+',
    '*2',
    '(1+2',
    '1+2)',
    '()',
    '1 2',
    '2n',
    '1..2',
    '1.2.3',
    '.',
    '3 $ 4',
    '1 % 2',
    'a.b',
    'a[0]',
    '"x"',
    "'x'",
    '1;2',
    '1,2',
    '{}',
    '=1',
    '1==1',
  ]
  for (const s of bad) {
    it(`拒绝 ${JSON.stringify(s)}`, () => {
      expect(() => evaluate(s, { a: 1, n: 1 })).toThrow(ExprError)
    })
  }

  it('拒绝函数调用与代码注入：alert(1) 等', () => {
    for (const s of ['alert(1)', 'Math.max(1,2)', 'constructor("x")()', 'process.exit()', 'eval("1")', 'f(x)(y)', '(1)(2)']) {
      expect(() => parseExpr(s), s).toThrow(ExprError)
    }
  })

  it('不会通过原型链取到变量', () => {
    expect(() => evaluate('constructor')).toThrow(/没有定义/)
    expect(() => evaluate('__proto__')).toThrow(/没有定义/)
    expect(() => evaluate('toString')).toThrow(/没有定义/)
  })

  it('未定义变量 / 除以 0 / 非有限结果', () => {
    expect(() => evaluate('x + 1')).toThrow(/x/)
    expect(() => evaluate('1/0')).toThrow(/0/)
    expect(() => evaluate('1/(n-n)', { n: 3 })).toThrow(ExprError)
    expect(() => evaluate('(-8)^0.5')).toThrow(ExprError)
    expect(() => evaluate('10^1000')).toThrow(ExprError)
  })

  it('过长 / 嵌套过深', () => {
    expect(() => evaluate('1+'.repeat(150) + '1')).toThrow(/太长/)
    expect(() => evaluate('('.repeat(80) + '1' + ')'.repeat(80))).toThrow(/嵌套/)
  })
})

describe('模板 {{expr}}', () => {
  it('提取与渲染', () => {
    const t = '8,\\ 12(n-2)={{12*(n-2)}},\\ n^3={{n^3}}'
    expect(templateExprs(t)).toEqual(['12*(n-2)', 'n^3'])
    expect(renderTemplate(t, { n: 4 })).toBe('8,\\ 12(n-2)=24,\\ n^3=64')
  })

  it('没有占位符则原样返回；KaTeX 的单层花括号不受影响', () => {
    expect(renderTemplate('\\frac{1}{2}', {})).toBe('\\frac{1}{2}')
  })

  it('占位符里有非法表达式则抛错', () => {
    expect(() => renderTemplate('{{alert(1)}}', {})).toThrow(ExprError)
  })

  it('formatNumber 去掉多余小数', () => {
    expect(formatNumber(3)).toBe('3')
    expect(formatNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatNumber(2 / 3)).toBe('0.666667')
    expect(formatNumber(-0)).toBe('0')
  })
})

/** 粗略估算一段文字在屏幕上的像素宽度（只用于取景留白，不用于排版）：汉字 / 全角 = 1em，数字 / 字母 ≈ 0.6em，其它符号 ≈ 0.8em */
export function textPx(text: string, fontPx: number): number {
  let em = 0
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if (c >= 0x2e80 || (c >= 0xff00 && c <= 0xffef)) em += 1
    else if (c < 0x80) em += /[0-9A-Za-z]/.test(ch) ? 0.6 : 0.45
    else em += 0.8
  }
  return em * fontPx
}

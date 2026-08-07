import { describe, expect, it } from 'vitest'
import { formatAmount, formatWon, parseAmountInput } from './money'

describe('formatWon — 표시는 천 단위 콤마 (SPEC §UI 규칙)', () => {
  it('원 단위 정수를 콤마와 함께 보여 준다', () => {
    expect(formatWon(47800)).toBe('47,800원')
    expect(formatWon(0)).toBe('0원')
    expect(formatWon(1234567)).toBe('1,234,567원')
  })

  it('금액만 필요한 자리에서는 단위를 빼고 준다', () => {
    expect(formatAmount(59800)).toBe('59,800')
    expect(formatAmount(0)).toBe('0')
  })
})

describe('parseAmountInput — 숫자 키패드 입력 → 원 단위 정수 (결정 #17)', () => {
  it('콤마·공백이 섞여 들어와도 정수로 읽는다', () => {
    expect(parseAmountInput('59,800')).toBe(59800)
    expect(parseAmountInput(' 12000 ')).toBe(12000)
  })

  it('비어 있으면 미입력(null)이다 — 0원과 구분한다', () => {
    expect(parseAmountInput('')).toBeNull()
    expect(parseAmountInput('   ')).toBeNull()
    expect(parseAmountInput('0')).toBe(0)
  })

  it('부호·소수점은 자릿수만 남긴다 — 음수·소수 금액은 만들지 않는다', () => {
    expect(parseAmountInput('-5000')).toBe(5000)
    expect(parseAmountInput('1200.50')).toBe(120050)
    expect(parseAmountInput('원')).toBeNull()
  })

  it('아홉 자리까지만 받는다 — integer 컬럼을 넘기지 않는다', () => {
    expect(parseAmountInput('9999999999')).toBe(999999999)
  })
})

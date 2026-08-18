import { describe, expect, it } from 'vitest'
import { DAY_COLORS, dayColorOf, dayColorVar, isDayColor } from './day-color'

describe('dayColorOf — 고른 색이 없으면 순서대로 돈다 (결정 #41)', () => {
  it('고른 색이 있으면 그것을 쓴다', () => {
    expect(dayColorOf({ color: 'sky', position: 0 })).toBe('sky')
  })

  it('안 골랐으면 position 순서로 팔레트를 돈다 — 만들자마자 서로 구분돼야 한다', () => {
    expect(dayColorOf({ color: null, position: 0 })).toBe(DAY_COLORS[0])
    expect(dayColorOf({ color: null, position: 1 })).toBe(DAY_COLORS[1])
    expect(dayColorOf({ color: null, position: 2 })).toBe(DAY_COLORS[2])
  })

  it('팔레트보다 일차가 많으면 처음으로 돌아온다', () => {
    expect(dayColorOf({ color: null, position: DAY_COLORS.length })).toBe(DAY_COLORS[0])
    expect(dayColorOf({ color: null, position: DAY_COLORS.length + 3 })).toBe(DAY_COLORS[3])
  })

  it('팔레트 밖의 값이 저장돼 있어도 죽지 않고 기본색으로 물러난다', () => {
    expect(dayColorOf({ color: '#ff0000', position: 1 })).toBe(DAY_COLORS[1])
    expect(dayColorOf({ color: undefined, position: 1 })).toBe(DAY_COLORS[1])
  })
})

describe('isDayColor — DB CHECK 와 같은 목록을 본다', () => {
  it('팔레트 안이면 참', () => {
    for (const color of DAY_COLORS) expect(isDayColor(color)).toBe(true)
  })

  it('hex·빈값·null 은 거짓', () => {
    expect(isDayColor('#ff0000')).toBe(false)
    expect(isDayColor('')).toBe(false)
    expect(isDayColor(null)).toBe(false)
  })
})

describe('dayColorVar — 실제 색값은 CSS 가 라이트/다크로 갈라 준다', () => {
  it('토큰을 CSS 변수 참조로 바꾼다', () => {
    expect(dayColorVar('sky')).toBe('var(--day-sky)')
  })
})

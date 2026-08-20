import { describe, expect, it } from 'vitest'
import { formatDistance, formatDuration } from './format'

describe('formatDuration — 분과 시간으로 읽는다', () => {
  it('한 시간 미만은 분으로', () => {
    expect(formatDuration(0)).toBe('0분')
    expect(formatDuration(2403)).toBe('40분')
    expect(formatDuration(3540)).toBe('59분')
  })

  it('한 시간 넘으면 시간과 분으로', () => {
    expect(formatDuration(3600)).toBe('1시간')
    expect(formatDuration(5643)).toBe('1시간 34분')
    expect(formatDuration(7260)).toBe('2시간 1분')
  })
})

describe('formatDistance — 1km 를 경계로 단위를 바꾼다', () => {
  it('1km 미만은 미터로', () => {
    expect(formatDistance(0)).toBe('0m')
    expect(formatDistance(950)).toBe('950m')
  })

  it('1km 이상은 소수 한 자리 km 로 — 추정치에 그보다 정밀한 값은 어울리지 않는다', () => {
    expect(formatDistance(1000)).toBe('1.0km')
    expect(formatDistance(28073)).toBe('28.1km')
  })
})

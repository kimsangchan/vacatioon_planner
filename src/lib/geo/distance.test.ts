// T10-20 — 두 좌표 사이의 직선 거리. 교체 후보를 "이 부근" 순으로 세우는 데 쓴다.
// 외부 API 를 부르지 않는다 — 후보 정렬은 목록을 여는 순간 즉시 나와야 한다.

import { describe, expect, it } from 'vitest'
import { distanceMeters } from './distance'

const JEJU_AIRPORT = { lat: 33.5070, lng: 126.4930 }
const SEONGSAN = { lat: 33.4580, lng: 126.9425 }
const YONGDUAM = { lat: 33.5150, lng: 126.5170 }

describe('distanceMeters', () => {
  it('같은 자리는 0m 다', () => {
    expect(distanceMeters(JEJU_AIRPORT, JEJU_AIRPORT)).toBe(0)
  })

  it('제주공항에서 성산일출봉은 42km 안팎이다', () => {
    const meters = distanceMeters(JEJU_AIRPORT, SEONGSAN)
    expect(meters).toBeGreaterThan(41_000)
    expect(meters).toBeLessThan(43_000)
  })

  it('가까운 곳은 가깝게 — 공항에서 용두암은 2.5km 안팎', () => {
    const meters = distanceMeters(JEJU_AIRPORT, YONGDUAM)
    expect(meters).toBeGreaterThan(2_000)
    expect(meters).toBeLessThan(3_000)
  })

  it('방향이 바뀌어도 같은 거리다', () => {
    expect(distanceMeters(JEJU_AIRPORT, SEONGSAN)).toBe(distanceMeters(SEONGSAN, JEJU_AIRPORT))
  })

  it('미터 단위 정수로 준다 — 표기(formatDistance)가 소수를 다시 만들지 않게', () => {
    expect(Number.isInteger(distanceMeters(JEJU_AIRPORT, SEONGSAN))).toBe(true)
  })
})

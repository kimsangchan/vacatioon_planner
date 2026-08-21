// 여행 경비 집계 (결정 #39). 확정(실제 지출)과 예상을 절대 한 숫자로 섞지 않는다 —
// 섞으면 "이미 쓴 돈"을 화면에서 되찾을 수 없다.

import { describe, expect, it } from 'vitest'
import type { DayRow, LegRow, PlaceRow, StopRow } from './bundle'
import { storageEstimate, tripBudget } from './budget'

function place(id: string, estimated: number | null): PlaceRow {
  return {
    id,
    trip_id: 't1',
    category: 'restaurant',
    name: id,
    address: '',
    road_address: '',
    lat: 33.5,
    lng: 126.5,
    provider: 'naver',
    provider_link: null,
    phone: '',
    opening_hours: '',
    memo: '',
    estimated_cost: estimated,
    photos: [],
  }
}

function stop(id: string, placeId: string, cost: number | null): StopRow {
  return {
    id,
    day_id: 'd1',
    place_id: placeId,
    position: 0,
    start_time: null,
    cost_amount: cost,
    confirmed: true,
    note: '',
  }
}

function leg(id: string, cost: number | null): LegRow {
  return {
    id,
    day_id: 'd1',
    mode: 'train',
    depart_at: '09:00',
    arrive_at: '10:00',
    arrive_day_offset: 0,
    from_label: '',
    to_label: '',
    booking_ref: '',
    cost_amount: cost,
    memo: '',
    position: 1,
    photos: [],
  }
}

function day(stops: StopRow[], legs: LegRow[]): DayRow {
  return { id: 'd1', trip_id: 't1', date: '2026-09-01', position: 0, color: null, stops, legs }
}

describe('tripBudget — 확정과 예상을 갈라 놓는다 (결정 #39)', () => {
  it('아무 금액도 없으면 보여줄 게 없다', () => {
    const budget = tripBudget([day([stop('s1', 'p1', null)], [])], [place('p1', null)])

    expect(budget).toEqual({ confirmed: 0, withEstimate: 0, hasAny: false })
  })

  it('실제 지출만 있으면 두 값이 같다 — 더 보탤 추정이 없다', () => {
    const budget = tripBudget([day([stop('s1', 'p1', 15000)], [leg('l1', 40000)])], [place('p1', null)])

    expect(budget).toEqual({ confirmed: 55000, withEstimate: 55000, hasAny: true })
  })

  it('금액을 안 적은 방문은 그 장소의 예상 단가로 채워 "예상 포함"에만 더한다', () => {
    const budget = tripBudget(
      [day([stop('s1', 'p1', 15000), stop('s2', 'p2', null)], [])],
      [place('p1', 9999), place('p2', 45000)],
    )

    // p1 은 실제가 적혀 있으므로 예상(9999)을 쓰지 않는다 — 실제가 언제나 이긴다
    expect(budget.confirmed).toBe(15000)
    expect(budget.withEstimate).toBe(60000)
  })

  it('0원 지출은 미입력이 아니다 — 예상으로 덮어쓰지 않는다', () => {
    const budget = tripBudget([day([stop('s1', 'p1', 0)], [])], [place('p1', 30000)])

    expect(budget.confirmed).toBe(0)
    expect(budget.withEstimate).toBe(0)
    expect(budget.hasAny).toBe(true)
  })

  it('예상만 있어도 보여줄 게 있다', () => {
    const budget = tripBudget([day([stop('s1', 'p1', null)], [])], [place('p1', 20000)])

    expect(budget).toEqual({ confirmed: 0, withEstimate: 20000, hasAny: true })
  })

  it('이동(Leg)에는 예상이 없다 — 미입력은 그냥 0이다', () => {
    const budget = tripBudget([day([], [leg('l1', null)])], [])

    expect(budget).toEqual({ confirmed: 0, withEstimate: 0, hasAny: false })
  })

  it('같은 장소를 두 번 방문하면 예상도 두 번 센다 — 방문마다 돈이 든다 (#21)', () => {
    const budget = tripBudget(
      [day([stop('s1', 'p1', null), stop('s2', 'p1', null)], [])],
      [place('p1', 12000)],
    )

    expect(budget.withEstimate).toBe(24000)
  })

  it('여러 일차를 통틀어 더한다', () => {
    const d1 = { ...day([stop('s1', 'p1', 10000)], []), id: 'd1' }
    const d2 = { ...day([stop('s2', 'p2', null)], [leg('l1', 5000)]), id: 'd2', position: 1 }

    const budget = tripBudget([d1, d2], [place('p1', null), place('p2', 7000)])

    expect(budget.confirmed).toBe(15000)
    expect(budget.withEstimate).toBe(22000)
  })

  it('장소가 사라진 방문은 예상 없이 넘어간다 (지운 장소)', () => {
    const budget = tripBudget([day([stop('s1', 'missing', null)], [])], [place('p1', 30000)])

    expect(budget).toEqual({ confirmed: 0, withEstimate: 0, hasAny: false })
  })
})

describe('storageEstimate — 보관함은 총액에 안 섞는다 (아직 갈지 모르는 후보다)', () => {
  it('예상 단가를 적어 둔 후보만 센다', () => {
    const result = storageEstimate([place('p1', 20000), place('p2', null), place('p3', 5000)])

    expect(result).toEqual({ count: 2, total: 25000, hasAny: true })
  })

  it('아무도 안 적었으면 보여줄 게 없다', () => {
    expect(storageEstimate([place('p1', null)])).toEqual({ count: 0, total: 0, hasAny: false })
  })
})

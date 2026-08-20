// 일차 안에서 "이동시간을 물어볼 구간"을 고른다 (결정 #45).
// 사용자가 직접 적은 이동(Leg)이 사이에 있으면 추정치를 끼우지 않는다 — 기록이 추정보다 세다.

import { describe, expect, it } from 'vitest'
import type { DayItem } from './merge'
import { routeSegments } from './route'

const stop = (id: string, position: number, confirmed = true): DayItem => ({
  kind: 'stop',
  id,
  position,
  start_time: null,
  cost_amount: null,
  confirmed,
  timeWarning: false,
})

const leg = (id: string, position: number): DayItem => ({
  kind: 'leg',
  id,
  position,
  depart_at: '09:00',
  arrive_at: '10:00',
  arrive_day_offset: 0,
  cost_amount: null,
  timeWarning: false,
})

describe('routeSegments — 붙어 있는 방문끼리만 잇는다', () => {
  it('세 곳이 나란히 있으면 두 구간이 나온다 (부산역→기장→동래)', () => {
    const segments = routeSegments([stop('a', 0), stop('b', 1), stop('c', 2)])

    expect(segments).toEqual([
      { fromStopId: 'a', toStopId: 'b' },
      { fromStopId: 'b', toStopId: 'c' },
    ])
  })

  it('사이에 적어 둔 이동이 있으면 그 구간은 묻지 않는다 — 기록이 이미 있다', () => {
    const segments = routeSegments([stop('a', 0), leg('l1', 1), stop('b', 2), stop('c', 3)])

    expect(segments).toEqual([{ fromStopId: 'b', toStopId: 'c' }])
  })

  it('방문이 하나뿐이면 이을 곳이 없다', () => {
    expect(routeSegments([stop('a', 0)])).toEqual([])
    expect(routeSegments([])).toEqual([])
  })

  it('이동만 있으면 아무것도 묻지 않는다', () => {
    expect(routeSegments([leg('l1', 0), leg('l2', 1)])).toEqual([])
  })

  it('순서가 바뀌면 구간도 바뀐다 — 목록 순서가 곧 이동 순서다', () => {
    const reordered = routeSegments([stop('c', 0), stop('a', 1), stop('b', 2)])

    expect(reordered).toEqual([
      { fromStopId: 'c', toStopId: 'a' },
      { fromStopId: 'a', toStopId: 'b' },
    ])
  })
})

describe('routeSegments — 확정된 것만 잇는다 (결정 #47)', () => {
  it('가운데가 미확정이면 건너뛰고 앞뒤를 잇는다 — 갈지 모르는 곳의 시간을 끼우지 않는다', () => {
    const segments = routeSegments([stop('a', 0), stop('b', 1, false), stop('c', 2)])

    expect(segments).toEqual([{ fromStopId: 'a', toStopId: 'c' }])
  })

  it('확정이 하나뿐이면 이을 곳이 없다', () => {
    expect(routeSegments([stop('a', 0), stop('b', 1, false)])).toEqual([])
  })

  it('전부 미확정이면 아무것도 묻지 않는다 — 협의가 끝나기 전엔 경로도 없다', () => {
    expect(routeSegments([stop('a', 0, false), stop('b', 1, false)])).toEqual([])
  })

  it('미확정을 빼도 사이의 이동(Leg)은 여전히 구간을 끊는다', () => {
    const segments = routeSegments([stop('a', 0), leg('l1', 1), stop('b', 2, false), stop('c', 3)])

    expect(segments).toEqual([])
  })

  it('confirmed 를 안 적으면 확정으로 본다 — DB 기본값과 같다 (결정 #47)', () => {
    const naked = { kind: 'stop' as const, id: 'x', position: 0, start_time: null, cost_amount: null, timeWarning: false }
    const next = { kind: 'stop' as const, id: 'y', position: 1, start_time: null, cost_amount: null, timeWarning: false }

    expect(routeSegments([naked, next])).toEqual([{ fromStopId: 'x', toStopId: 'y' }])
  })
})

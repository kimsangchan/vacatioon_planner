// T7-3 — 기간 변경(FR-015)의 문구·계산. 순수 함수라 여기서 전부 굳힌다.
// RPC 는 데이터를 지키지만(단일 트랜잭션·보관함 복귀), 놀라지 않게 하는 건 이 두 문장의 일이다.

import { describe, expect, it } from 'vitest'
import type { DayRow, StopRow } from './bundle'
import { dateChangeNotice, shrinkConfirmMessage, shrinkImpact } from './dates'

const stop = (id: string): StopRow => ({
  id,
  day_id: 'd',
  place_id: `p-${id}`,
  position: 0,
  start_time: null,
  cost_amount: null,
  note: '',
})

const day = (date: string, stops: StopRow[] = []): DayRow => ({
  id: `day-${date}`,
  trip_id: 'trip-1',
  date,
  position: 0,
  color: null,
  stops,
  legs: [],
})

const DAYS = [
  day('2026-08-11'),
  day('2026-08-12', [stop('s1')]),
  day('2026-08-13', [stop('s2'), stop('s3')]),
]

describe('shrinkImpact — 줄이면 무엇이 밀려나는지 (FR-015 축소 확인)', () => {
  it('새 기간 밖으로 나가면서 담긴 게 있는 Day 만 센다', () => {
    expect(shrinkImpact(DAYS, '2026-08-11', '2026-08-12')).toEqual({
      dates: ['2026-08-13'],
      stops: 2,
    })
  })

  it('앞뒤로 동시에 줄면 양쪽을 날짜 순으로 모은다', () => {
    expect(shrinkImpact(DAYS, '2026-08-12', '2026-08-12')).toEqual({
      dates: ['2026-08-13'],
      stops: 2,
    })
    expect(shrinkImpact(DAYS, '2026-08-13', '2026-08-13')).toEqual({
      dates: ['2026-08-12'],
      stops: 1,
    })
  })

  it('빈 Day 만 사라지면 옮겨질 게 없다', () => {
    expect(shrinkImpact(DAYS, '2026-08-12', '2026-08-13')).toEqual({ dates: [], stops: 0 })
  })

  it('늘리기만 하면 밀려나는 Day 가 없다', () => {
    expect(shrinkImpact(DAYS, '2026-08-10', '2026-08-15')).toEqual({ dates: [], stops: 0 })
  })
})

describe('shrinkConfirmMessage — 실행 전에 한 번 묻는다 (놀람 방지)', () => {
  it('하루가 줄면 그 날짜와 곳 수를 함께 묻는다', () => {
    expect(shrinkConfirmMessage({ dates: ['2026-08-13'], stops: 2 })).toBe(
      '8/13 하루를 줄이면 담긴 2곳이 보관함으로 돌아가요 — 계속할까요?',
    )
  })

  it('이틀이 줄면 날짜를 나란히 붙인다', () => {
    expect(shrinkConfirmMessage({ dates: ['2026-08-13', '2026-08-14'], stops: 3 })).toBe(
      '8/13·8/14 이틀을 줄이면 담긴 3곳이 보관함으로 돌아가요 — 계속할까요?',
    )
  })

  it('옮겨질 게 없으면 묻지 않는다 — 확인은 놀랄 때만이다', () => {
    expect(shrinkConfirmMessage({ dates: [], stops: 0 })).toBeNull()
  })
})

describe('dateChangeNotice — E-14 반환 카운트를 사람 말로 (FR-015)', () => {
  it('빠진 Stop 이 모두 보관함으로 돌아가면 그 수를 알린다', () => {
    expect(dateChangeNotice({ removed_stops: 2, unassigned_places: 2 })).toBe(
      '일정에서 빠진 곳 2곳을 보관함으로 옮겼어요.',
    )
  })

  it('다른 날에도 담겨 있어 보관함이 그대로면 그렇게 말한다', () => {
    const notice = dateChangeNotice({ removed_stops: 2, unassigned_places: 0 })

    expect(notice).toContain('2곳')
    expect(notice).toContain('보관함은 그대로')
  })

  it('일부만 돌아가면 두 수를 구분해 알린다 (removed_stops ≠ unassigned_places)', () => {
    const notice = dateChangeNotice({ removed_stops: 3, unassigned_places: 1 })

    expect(notice).toContain('3곳')
    expect(notice).toContain('1곳')
    expect(notice).toContain('다른 날')
  })

  it('옮긴 게 없으면 바뀐 사실만 알린다', () => {
    expect(dateChangeNotice({ removed_stops: 0, unassigned_places: 0 })).toBe('기간을 바꿨어요.')
  })
})

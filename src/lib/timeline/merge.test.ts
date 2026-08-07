import { describe, expect, it } from 'vitest'
import { daySum, mergeDayItems, type LegLike, type StopLike } from './merge'

const stop = (o: Partial<StopLike> & { id: string; position: number }): StopLike => ({
  start_time: null,
  ...o,
})
const leg = (o: Partial<LegLike> & { id: string; position: number }): LegLike => ({
  depart_at: '09:00',
  arrive_at: '10:00',
  arrive_day_offset: 0,
  cost_amount: null,
  ...o,
})

describe('mergeDayItems — 통합 position 병합 (결정 #15)', () => {
  it('stops와 legs를 position 오름차순 단일 배열로 병합한다', () => {
    const merged = mergeDayItems(
      [stop({ id: 's1', position: 0 }), stop({ id: 's2', position: 2 })],
      [leg({ id: 'l1', position: 1 })],
    )
    expect(merged.map((m) => m.id)).toEqual(['s1', 'l1', 's2'])
    expect(merged.map((m) => m.kind)).toEqual(['stop', 'leg', 'stop'])
  })

  it('시각은 정렬에 관여하지 않는다 — position이 유일 기준', () => {
    const merged = mergeDayItems(
      [stop({ id: 's1', position: 1, start_time: '08:00' })],
      [leg({ id: 'l1', position: 0, depart_at: '12:00' })],
    )
    expect(merged.map((m) => m.id)).toEqual(['l1', 's1'])
  })

  it('시각 없는 항목뿐이면 경고가 없다', () => {
    const merged = mergeDayItems(
      [stop({ id: 's1', position: 0 }), stop({ id: 's2', position: 1 })],
      [],
    )
    expect(merged.every((m) => !m.timeWarning)).toBe(true)
  })

  it('position 순서와 시각 순서가 역전된 항목에 timeWarning을 표시한다', () => {
    const merged = mergeDayItems(
      [stop({ id: 's1', position: 0, start_time: '10:00' })],
      [leg({ id: 'l1', position: 1, depart_at: '09:00' })],
    )
    expect(merged.find((m) => m.id === 's1')?.timeWarning).toBe(false)
    expect(merged.find((m) => m.id === 'l1')?.timeWarning).toBe(true)
  })

  it('시각 없는 항목은 경고 판정에 끼어들지 않는다', () => {
    const merged = mergeDayItems(
      [
        stop({ id: 's1', position: 0, start_time: '09:00' }),
        stop({ id: 's2', position: 1 }), // 무시각
        stop({ id: 's3', position: 2, start_time: '08:00' }),
      ],
      [],
    )
    expect(merged.map((m) => m.timeWarning)).toEqual([false, false, true])
  })

  it('익일 도착 Leg의 arrive_at은 비교에서 제외된다 (depart_at만 사용)', () => {
    const merged = mergeDayItems(
      [stop({ id: 's1', position: 1, start_time: '23:30' })],
      [leg({ id: 'l1', position: 0, depart_at: '23:00', arrive_at: '01:10', arrive_day_offset: 1 })],
    )
    // arrive 01:10을 비교에 넣으면 s1(23:30)이 오탐된다 — depart(23:00) 기준이므로 경고 없음
    expect(merged.every((m) => !m.timeWarning)).toBe(true)
  })
})

describe('daySum — Day 지출 합계 (결정 #17, 원 단위 정수)', () => {
  it('cost_amount 비-null 합을 반환한다', () => {
    expect(
      daySum([
        leg({ id: 'l1', position: 0, cost_amount: 59800 }),
        leg({ id: 'l2', position: 1 }),
        leg({ id: 'l3', position: 2, cost_amount: 3000 }),
      ]),
    ).toBe(62800)
  })

  it('빈 배열·전부 null이면 0', () => {
    expect(daySum([])).toBe(0)
    expect(daySum([leg({ id: 'l1', position: 0 })])).toBe(0)
  })
})

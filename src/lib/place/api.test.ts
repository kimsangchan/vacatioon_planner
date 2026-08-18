// T6-2 — E-04 저장 시 PostgREST 오류를 계약 코드로 정규화한다 (trips/api.ts 와 같은 어휘).

import { describe, expect, it } from 'vitest'
import {
  placeErrorMessage,
  PlaceError,
  toPlaceError,
  updatePlaceEstimatedCost,
  updatePlaceMemo,
} from './api'

describe('toPlaceError — E-04 오류 정규화', () => {
  it('부분 유니크 위반(23505)은 중복이다', () => {
    const error = toPlaceError({ message: 'duplicate key value', code: '23505' })

    expect(error).toBeInstanceOf(PlaceError)
    expect(error.code).toBe('conflict/duplicate')
  })

  it('lat·lng CHECK 위반(23514)은 좌표 오류다', () => {
    expect(toPlaceError({ message: 'places_lat_check', code: '23514' }).code).toBe(
      'validation/coords',
    )
  })

  it('나머지는 unknown 으로 모은다', () => {
    expect(toPlaceError({ message: 'boom' }).code).toBe('unknown')
  })
})

describe('updatePlaceMemo — E-09 부분 갱신 (FR-009)', () => {
  function fakeClient(result: { data?: unknown; error?: { message: string; code?: string } }) {
    const calls: { patch: Record<string, unknown>; id: unknown }[] = []
    const client = {
      from(table: string) {
        expect(table).toBe('places')
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq(column: string, value: unknown) {
                expect(column).toBe('id')
                calls.push({ patch, id: value })
                return {
                  select: () => ({
                    single: async () => ({ data: result.data ?? null, error: result.error ?? null }),
                  }),
                }
              },
            }
          },
        }
      },
    }
    return { client, calls }
  }

  it('메모만 보내고 갱신된 장소를 돌려준다', async () => {
    const { client, calls } = fakeClient({ data: { id: 'p1', memo: '9시 전에 가기' } })

    const place = await updatePlaceMemo(client as never, 'p1', '  9시 전에 가기  ')

    expect(calls).toEqual([{ patch: { memo: '9시 전에 가기' }, id: 'p1' }])
    expect(place.memo).toBe('9시 전에 가기')
  })

  it('없는 장소는 계약 코드로 알린다', async () => {
    const { client } = fakeClient({ error: { message: 'no rows', code: 'PGRST116' } })

    await expect(updatePlaceMemo(client as never, 'p1', '메모')).rejects.toMatchObject({
      code: 'not-found',
    })
  })
})

describe('updatePlaceEstimatedCost — 예상 금액 (결정 #39)', () => {
  function fakeClient(result: { data?: unknown; error?: { message: string; code?: string } }) {
    const calls: { patch: Record<string, unknown>; id: unknown }[] = []
    const client = {
      from(table: string) {
        expect(table).toBe('places')
        return {
          update(patch: Record<string, unknown>) {
            return {
              eq(column: string, value: unknown) {
                calls.push({ patch, id: value })
                return {
                  select: () => ({
                    single: async () => ({ data: result.data ?? null, error: result.error ?? null }),
                  }),
                }
              },
            }
          },
        }
      },
    }
    return { client, calls }
  }

  it('예상 금액만 보낸다 — 실제 지출(stops.cost_amount)은 건드리지 않는다', async () => {
    const { client, calls } = fakeClient({ data: { id: 'p1', estimated_cost: 20000 } })

    const place = await updatePlaceEstimatedCost(client as never, 'p1', 20000)

    expect(calls).toEqual([{ patch: { estimated_cost: 20000 }, id: 'p1' }])
    expect(place.estimated_cost).toBe(20000)
  })

  it('지우면 null 로 되돌린다 — 0원과 다른 값이다', async () => {
    const { client, calls } = fakeClient({ data: { id: 'p1', estimated_cost: null } })

    await updatePlaceEstimatedCost(client as never, 'p1', null)

    expect(calls[0].patch).toEqual({ estimated_cost: null })
  })

  it('0원도 그대로 보낸다 — 무료인 곳을 적을 수 있어야 한다', async () => {
    const { client, calls } = fakeClient({ data: { id: 'p1', estimated_cost: 0 } })

    await updatePlaceEstimatedCost(client as never, 'p1', 0)

    expect(calls[0].patch).toEqual({ estimated_cost: 0 })
  })

  it('없는 장소는 계약 코드로 알린다', async () => {
    const { client } = fakeClient({ error: { message: 'no rows', code: 'PGRST116' } })

    await expect(updatePlaceEstimatedCost(client as never, 'p1', 100)).rejects.toMatchObject({
      code: 'not-found',
    })
  })
})

describe('placeErrorMessage — 다음 행동이 있는 문구 (SPEC §UI 규칙)', () => {
  it('중복은 이미 담아둔 곳임을 알린다', () => {
    expect(placeErrorMessage('conflict/duplicate')).toContain('이미 담아둔 곳이에요')
  })

  it('좌표 오류·알 수 없는 오류에도 문구가 있다', () => {
    expect(placeErrorMessage('validation/coords').length).toBeGreaterThan(0)
    expect(placeErrorMessage('unknown').length).toBeGreaterThan(0)
  })
})

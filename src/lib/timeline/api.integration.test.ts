// T7-1·T7-2 (docs/design/06 변환표 FR-007·FR-008) — 로컬 Supabase 대상 integration.
// E-07 배치·해제·혼합 재정렬(reorder_day_items) + E-08 Leg CRUD + 결정 #24 Stop 가격.

import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { savePlace } from '@/lib/place/api'
import { signInWithOtpCode, uniqueTestEmail } from '@/test-support/supabase-local'
import { createTrip } from '@/lib/trips/api'
import { fetchTripBundle, unassignedPlaces } from '@/lib/trips/bundle'
import { dayTotal } from './merge'
import {
  TimelineError,
  placeStops,
  removeLeg,
  removeStop,
  reorderDayItems,
  saveLeg,
  toTimelineError,
  updateStop,
} from './api'

describe('E-07 배치·재정렬 + E-08 이동 (FR-007·FR-008)', () => {
  let client: SupabaseClient
  let ownerId: string
  let dayId: string

  const spotStopId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const restaurantId = crypto.randomUUID()
  const spotId = crypto.randomUUID()
  const stopA = crypto.randomUUID()
  const legId = crypto.randomUUID()

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('timeline'))
    ownerId = (await client.auth.getUser()).data.user!.id

    await createTrip(client, {
      id: tripId,
      name: '타임라인 여행',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
    })

    const base = { trip_id: tripId, owner_id: ownerId, provider: 'naver' as const }
    await savePlace(client, {
      ...base,
      id: restaurantId,
      category: 'restaurant',
      name: '흑돼지집',
      address: '제주특별자치도 제주시',
      road_address: '제주특별자치도 제주시 노형로 2',
      lat: 33.4996,
      lng: 126.5312,
      provider_link: null,
    })
    await savePlace(client, {
      ...base,
      id: spotId,
      category: 'spot',
      name: '성산일출봉',
      address: '제주특별자치도 서귀포시',
      road_address: '제주특별자치도 서귀포시 일출로 284-12',
      lat: 33.4581,
      lng: 126.9425,
      provider_link: null,
    })

    const bundle = await fetchTripBundle(client, tripId)
    dayId = bundle.days[0].id
  }, 40_000)

  it('보관함 Place 를 Day 에 배치하면 통합 position 으로 남는다', async () => {
    await placeStops(client, [
      { id: stopA, day_id: dayId, place_id: restaurantId, position: 0 },
      { id: spotStopId, day_id: dayId, place_id: spotId, position: 1 },
    ])

    const bundle = await fetchTripBundle(client, tripId)
    const day = bundle.days[0]

    expect(day.stops.map((stop) => [stop.place_id, stop.position])).toEqual([
      [restaurantId, 0],
      [spotId, 1],
    ])
    expect(unassignedPlaces(bundle)).toHaveLength(0)
  })

  it('같은 UUID 로 다시 배치해도 한 행이다 (E-07 PUT upsert · 05 §멱등성)', async () => {
    await placeStops(client, [
      { id: stopA, day_id: dayId, place_id: restaurantId, position: 0 },
    ])

    const { count } = await client
      .from('stops')
      .select('id', { count: 'exact', head: true })
      .eq('id', stopA)

    expect(count).toBe(1)
  })

  it('Stop 에 시각과 가격을 적어 둔다 (결정 #24 — 원 단위 정수)', async () => {
    const updated = await updateStop(client, stopA, { start_time: '09:30', cost_amount: 12000 })

    expect(updated.start_time).toBe('09:30:00')
    expect(updated.cost_amount).toBe(12000)
  })

  it('Stop 가격은 음수를 받지 않는다 (validation/cost-negative)', async () => {
    const failure = await updateStop(client, stopA, {
      start_time: '09:30',
      cost_amount: -1,
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(TimelineError)
    expect((failure as TimelineError).code).toBe('validation/cost-negative')
  })

  it('Leg 를 담으면 같은 Day 의 통합 시퀀스에 붙는다 (E-08)', async () => {
    const leg = await saveLeg(client, {
      id: legId,
      day_id: dayId,
      position: 2,
      mode: 'train',
      depart_at: '09:00',
      arrive_at: '11:30',
      arrive_day_offset: 0,
      from_label: '용산역',
      to_label: '목포역',
      booking_ref: 'KTX-1234',
      cost_amount: 59800,
      memo: '4호차',
    })

    expect(leg.mode).toBe('train')
    expect(leg.depart_at).toBe('09:00:00')
    expect(leg.cost_amount).toBe(59800)

    const bundle = await fetchTripBundle(client, tripId)
    const day = bundle.days[0]
    expect(day.legs.map((l) => l.id)).toEqual([legId])
    // FR-008: Day 지출 합계 = Stop + Leg (결정 #24)
    expect(dayTotal(day.stops, day.legs)).toBe(71800)
  })

  it('도착<출발인데 익일 확인이 없으면 저장하지 않는다 (validation/time-reversed)', async () => {
    const reversed = {
      id: crypto.randomUUID(),
      day_id: dayId,
      position: 3,
      mode: 'bus' as const,
      depart_at: '23:00',
      arrive_at: '01:10',
      arrive_day_offset: 0,
      from_label: '목포',
      to_label: '서울',
      booking_ref: '',
      cost_amount: null,
      memo: '',
    }

    const failure = await saveLeg(client, reversed).catch((error: unknown) => error)
    expect((failure as TimelineError).code).toBe('validation/time-reversed')

    // 폼을 우회해도 스키마가 같은 계약을 지킨다
    const { error } = await client.from('legs').insert(reversed)
    expect(error).not.toBeNull()
    expect(toTimelineError(error!).code).toBe('validation/time-reversed')
  })

  it('익일 도착으로 확인하면 offset 1 로 저장된다 (PRD 엣지)', async () => {
    const nightId = crypto.randomUUID()
    const leg = await saveLeg(client, {
      id: nightId,
      day_id: dayId,
      position: 3,
      mode: 'bus',
      depart_at: '23:00',
      arrive_at: '01:10',
      arrive_day_offset: 1,
      from_label: '목포',
      to_label: '서울',
      booking_ref: '',
      cost_amount: null,
      memo: '',
    })

    expect(leg.arrive_day_offset).toBe(1)
    await removeLeg(client, nightId)
  })

  it('Leg 가격도 음수를 받지 않는다', async () => {
    const { error } = await client
      .from('legs')
      .update({ cost_amount: -100 })
      .eq('id', legId)

    expect(error).not.toBeNull()
    expect(toTimelineError(error!).code).toBe('validation/cost-negative')
  })

  it('Stop 과 Leg 를 한 배열로 재정렬한다 (reorder_day_items)', async () => {
    const bundle = await fetchTripBundle(client, tripId)
    const stopIds = bundle.days[0].stops.map((stop) => stop.id)

    await reorderDayItems(client, dayId, [legId, ...stopIds])

    const after = await fetchTripBundle(client, tripId)
    const day = after.days[0]
    expect(day.legs[0].position).toBe(0)
    expect(day.stops.map((stop) => [stop.id, stop.position])).toEqual([
      [stopIds[0], 1],
      [stopIds[1], 2],
    ])
  })

  it('항목이 빠진 순서 배열은 통째로 거절된다 (validation/position-dup)', async () => {
    const failure = await reorderDayItems(client, dayId, [legId]).catch(
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(TimelineError)
    expect((failure as TimelineError).code).toBe('validation/position-dup')

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.days[0].legs[0].position).toBe(0)
  })

  it('배치를 해제하면 그 Place 가 보관함으로 돌아온다 (Stop 은 hard delete — E-12)', async () => {
    const before = await fetchTripBundle(client, tripId)
    const target = before.days[0].stops.find((stop) => stop.place_id === spotId)!

    await removeStop(client, target.id)

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.days[0].stops.map((stop) => stop.place_id)).toEqual([restaurantId])
    expect(unassignedPlaces(bundle).map((place) => place.id)).toEqual([spotId])
  })

  it('이동을 지우면 타임라인에서 사라진다', async () => {
    await removeLeg(client, legId)

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.days[0].legs).toHaveLength(0)
  })

  it('없는 Day 로 재정렬하면 not-found 로 알린다', async () => {
    const failure = await reorderDayItems(client, crypto.randomUUID(), []).catch(
      (error: unknown) => error,
    )

    expect((failure as TimelineError).code).toBe('not-found')
  })
})

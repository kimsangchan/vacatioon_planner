// T7-3 (docs/design/06 변환표 FR-015·FR-017) — 로컬 Supabase 대상 integration.
// E-14 update_trip_dates 실호출과 반환 카운트 · E-12 soft/hard 분리(Trip·Place 는 되돌릴 수 있고,
// 그에 딸린 Stop 은 즉시 사라진다).

import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { savePlace, softDeletePlace, restorePlace } from '@/lib/place/api'
import { placeStops } from '@/lib/timeline/api'
import { signInWithOtpCode, uniqueTestEmail } from '@/test-support/supabase-local'
import {
  TripError,
  createTrip,
  listDeletedTrips,
  listTrips,
  restoreTrip,
  softDeleteTrip,
  updateTripDates,
} from './api'
import { fetchTripBundle, unassignedPlaces } from './bundle'

const jeju = (id: string, name: string, tripId: string, ownerId: string, lat: number, lng: number) => ({
  id,
  trip_id: tripId,
  owner_id: ownerId,
  category: 'spot' as const,
  name,
  address: '제주특별자치도',
  road_address: '제주특별자치도',
  lat,
  lng,
  provider: 'manual' as const,
  provider_link: null,
})

describe('E-14 update_trip_dates — 기간 변경 캐스케이드 (FR-015)', () => {
  let client: SupabaseClient
  let ownerId: string
  const tripId = crypto.randomUUID()
  const bothDaysId = crypto.randomUUID() // 12일·13일 양쪽에 배치 — 줄여도 보관함에 안 간다
  const lastDayId = crypto.randomUUID() // 13일에만 배치 — 줄이면 보관함으로 돌아간다

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('dates'))
    ownerId = (await client.auth.getUser()).data.user!.id

    await createTrip(client, {
      id: tripId,
      name: '기간 바꾸는 여행',
      start_date: '2026-08-11',
      end_date: '2026-08-13',
    })
    await savePlace(client, jeju(bothDaysId, '우도', tripId, ownerId, 33.506, 126.951))
    await savePlace(client, jeju(lastDayId, '성산일출봉', tripId, ownerId, 33.458, 126.942))

    const bundle = await fetchTripBundle(client, tripId)
    const [, second, third] = bundle.days

    await placeStops(client, [
      { id: crypto.randomUUID(), day_id: second.id, place_id: bothDaysId, position: 0 },
      { id: crypto.randomUUID(), day_id: third.id, place_id: bothDaysId, position: 0 },
      { id: crypto.randomUUID(), day_id: third.id, place_id: lastDayId, position: 1 },
    ])
  }, 40_000)

  it('기간을 줄이면 Day 를 지우고 빠진 Stop 수와 보관함 복귀 수를 구분해 돌려준다', async () => {
    const change = await updateTripDates(client, {
      trip_id: tripId,
      start_date: '2026-08-11',
      end_date: '2026-08-12',
    })

    // 13일의 Stop 2개가 빠졌지만, 그중 우도는 12일에도 남아 있어 보관함 복귀는 1곳뿐이다
    expect(change).toEqual({ removed_stops: 2, unassigned_places: 1 })

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.end_date).toBe('2026-08-12')
    expect(bundle.days.map((day) => day.date)).toEqual(['2026-08-11', '2026-08-12'])
    // 데이터 손실 금지 — Place 는 그대로 남아 보관함으로 돌아온다 (PRD 엣지)
    expect(bundle.places.map((place) => place.id).sort()).toEqual([bothDaysId, lastDayId].sort())
    expect(unassignedPlaces(bundle).map((place) => place.id)).toEqual([lastDayId])
  })

  it('기간을 늘리면 Day 만 붙고 옮겨지는 건 없다 (position 0..n 유지)', async () => {
    const change = await updateTripDates(client, {
      trip_id: tripId,
      start_date: '2026-08-10',
      end_date: '2026-08-13',
    })

    expect(change).toEqual({ removed_stops: 0, unassigned_places: 0 })

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.days.map((day) => [day.date, day.position])).toEqual([
      ['2026-08-10', 0],
      ['2026-08-11', 1],
      ['2026-08-12', 2],
      ['2026-08-13', 3],
    ])
    // 남아 있던 Day 의 Stop 은 그대로다
    expect(bundle.days[2].stops.map((stop) => stop.place_id)).toEqual([bothDaysId])
  })

  it('끝나는 날이 앞서면 validation/date-range 로 막는다 (E-14)', async () => {
    const failure = await updateTripDates(client, {
      trip_id: tripId,
      start_date: '2026-08-13',
      end_date: '2026-08-10',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(TripError)
    expect((failure as TripError).code).toBe('validation/date-range')

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.start_date).toBe('2026-08-10')
  })

  it('없는 여행은 not-found 로 알린다', async () => {
    await expect(
      updateTripDates(client, {
        trip_id: crypto.randomUUID(),
        start_date: '2026-08-10',
        end_date: '2026-08-11',
      }),
    ).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('E-12 삭제·되돌리기 (FR-017)', () => {
  let client: SupabaseClient
  let ownerId: string
  const tripId = crypto.randomUUID()
  const keptId = crypto.randomUUID()
  const droppedId = crypto.randomUUID()
  const stopId = crypto.randomUUID()

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('erase'))
    ownerId = (await client.auth.getUser()).data.user!.id

    await createTrip(client, {
      id: tripId,
      name: '지웠다 되돌릴 여행',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
    })
    await savePlace(client, jeju(keptId, '한라산', tripId, ownerId, 33.361, 126.529))
    await savePlace(client, jeju(droppedId, '이호테우', tripId, ownerId, 33.494, 126.453))

    const bundle = await fetchTripBundle(client, tripId)
    await placeStops(client, [
      { id: stopId, day_id: bundle.days[0].id, place_id: droppedId, position: 0 },
    ])
  }, 40_000)

  it('Place 를 빼면 소프트 삭제되고 배치된 Stop 은 즉시 사라진다 (E-12 soft/hard 분리)', async () => {
    await softDeletePlace(client, droppedId)

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.places.map((place) => place.id)).toEqual([keptId])
    expect(bundle.days[0].stops).toHaveLength(0)

    const { count } = await client
      .from('stops')
      .select('id', { count: 'exact', head: true })
      .eq('id', stopId)
    expect(count).toBe(0)

    // 목록의 장소 수도 살아있는 것만 센다 (E-13)
    const trips = await listTrips(client)
    expect(trips.find((trip) => trip.id === tripId)?.place_count).toBe(1)
  })

  it('되돌리면 Place 는 보관함으로 돌아온다 (Stop 은 돌아오지 않는다 — 미리 알린 대로)', async () => {
    await restorePlace(client, droppedId)

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.places.map((place) => place.id).sort()).toEqual([droppedId, keptId].sort())
    expect(unassignedPlaces(bundle).map((place) => place.id).sort()).toEqual(
      [droppedId, keptId].sort(),
    )
  })

  it('Trip 을 지우면 목록에서 빠지고 90일 안에는 되돌릴 목록에 남는다', async () => {
    await softDeleteTrip(client, tripId)

    expect((await listTrips(client)).map((trip) => trip.id)).not.toContain(tripId)

    const deleted = await listDeletedTrips(client)
    const mine = deleted.find((trip) => trip.id === tripId)
    expect(mine?.name).toBe('지웠다 되돌릴 여행')
    expect(mine?.deleted_at).toBeTruthy()
  })

  it('되돌리면 목록과 캔버스가 함께 돌아온다 (E-09 deleted_at=null)', async () => {
    await restoreTrip(client, tripId)

    expect((await listTrips(client)).map((trip) => trip.id)).toContain(tripId)
    expect((await listDeletedTrips(client)).map((trip) => trip.id)).not.toContain(tripId)
    await expect(fetchTripBundle(client, tripId)).resolves.toMatchObject({ id: tripId })
  })

  it('지운 여행은 캔버스에서도 not-found 다', async () => {
    await softDeleteTrip(client, tripId)
    await expect(fetchTripBundle(client, tripId)).rejects.toMatchObject({ code: 'not-found' })
    await restoreTrip(client, tripId)
  })

  it('90일이 지난 삭제는 되돌릴 목록에서 내린다', async () => {
    const longAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await client.from('trips').update({ deleted_at: longAgo }).eq('id', tripId)
    expect(error).toBeNull()

    expect((await listDeletedTrips(client)).map((trip) => trip.id)).not.toContain(tripId)
  })
})

// FR-002·FR-014 (docs/design/06 변환표) — 로컬 Supabase 대상 integration.
// 시드는 전부 로그인한 사용자 권한으로 넣는다 (service role 미사용 — decision-log #11).

import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signInWithOtpCode, uniqueTestEmail } from '@/test-support/supabase-local'
import { createTrip, listTrips, TripError } from './api'

describe('E-02 create_trip — FR-002', () => {
  let client: SupabaseClient

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('create'))
  }, 30_000)

  it('creates one day per date with position 0..n in a single transaction', async () => {
    const id = crypto.randomUUID()

    const trip = await createTrip(client, {
      id,
      name: '제주 3일',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
    })

    expect(trip.id).toBe(id)
    expect(trip.timezone).toBe('Asia/Seoul')

    const { data: days } = await client
      .from('days')
      .select('date, position')
      .eq('trip_id', id)
      .order('position')

    expect(days).toEqual([
      { date: '2026-08-01', position: 0 },
      { date: '2026-08-02', position: 1 },
      { date: '2026-08-03', position: 2 },
    ])
  })

  it('keeps a single row when the same client UUID is retried (05 §멱등성)', async () => {
    const id = crypto.randomUUID()
    const input = { id, name: '재시도 여행', start_date: '2026-09-01', end_date: '2026-09-02' }

    await createTrip(client, input)
    await expect(createTrip(client, input)).rejects.toMatchObject({ code: 'conflict/duplicate' })

    const { count: tripCount } = await client
      .from('trips')
      .select('id', { count: 'exact', head: true })
      .eq('id', id)
    const { count: dayCount } = await client
      .from('days')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', id)

    expect(tripCount).toBe(1)
    expect(dayCount).toBe(2)
  })

  it('refuses an end date before the start date (validation/date-range)', async () => {
    const id = crypto.randomUUID()

    const failure = await createTrip(client, {
      id,
      name: '거꾸로 여행',
      start_date: '2026-08-03',
      end_date: '2026-08-01',
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(TripError)
    expect((failure as TripError).code).toBe('validation/date-range')

    const { count } = await client.from('trips').select('id', { count: 'exact', head: true }).eq('id', id)
    expect(count).toBe(0)
  })
})

describe('E-13 listTrips — FR-014', () => {
  let client: SupabaseClient
  let ownerId: string
  const liveTripId = crypto.randomUUID()
  const deletedTripId = crypto.randomUUID()

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('list'))
    const { data } = await client.auth.getUser()
    ownerId = data.user!.id

    await createTrip(client, {
      id: liveTripId,
      name: '살아있는 여행',
      start_date: '2026-08-01',
      end_date: '2026-08-03',
    })
    await createTrip(client, {
      id: deletedTripId,
      name: '지운 여행',
      start_date: '2026-10-01',
      end_date: '2026-10-02',
    })

    const place = (name: string, lat: number, lng: number, deleted_at: string | null) => ({
      id: crypto.randomUUID(),
      trip_id: liveTripId,
      owner_id: ownerId,
      category: 'spot',
      name,
      address: '제주특별자치도',
      road_address: '제주특별자치도',
      lat,
      lng,
      provider: 'manual',
      provider_link: null,
      deleted_at,
    })

    const { error: placeError } = await client.from('places').insert([
      place('성산일출봉', 33.458, 126.942, null),
      place('우도', 33.506, 126.951, null),
      place('지운 장소', 33.51, 126.52, new Date().toISOString()),
    ])
    expect(placeError).toBeNull()

    const { error: deleteError } = await client
      .from('trips')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedTripId)
    expect(deleteError).toBeNull()
  }, 40_000)

  it('lists only live trips with name, period and live place count', async () => {
    const trips = await listTrips(client)

    expect(trips).toEqual([
      {
        id: liveTripId,
        name: '살아있는 여행',
        start_date: '2026-08-01',
        end_date: '2026-08-03',
        place_count: 2,
      },
    ])
  })
})

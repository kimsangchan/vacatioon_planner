// T6-2·T6-3 (docs/design/06 변환표 FR-003·FR-005) — 로컬 Supabase 대상 integration.
// E-04 저장(클라 UUID·provider·provider_link·주소 포함) → 중복 conflict → E-06 Trip Bundle 조회.

import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { savePlace, PlaceError } from '@/lib/place/api'
import { signInWithOtpCode, uniqueTestEmail } from '@/test-support/supabase-local'
import { createTrip } from './api'
import { fetchTripBundle, unassignedPlaces } from './bundle'

describe('E-04 savePlace + E-06 Trip Bundle', () => {
  let client: SupabaseClient
  let ownerId: string
  const tripId = crypto.randomUUID()
  const seongsanId = crypto.randomUUID()
  const hotelId = crypto.randomUUID()
  const deletedId = crypto.randomUUID()

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('canvas'))
    ownerId = (await client.auth.getUser()).data.user!.id

    await createTrip(client, {
      id: tripId,
      name: '캔버스 여행',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
    })
  }, 40_000)

  it('검색 결과를 E-04 필드 그대로 담는다 (FR-003)', async () => {
    const saved = await savePlace(client, {
      id: seongsanId,
      trip_id: tripId,
      owner_id: ownerId,
      category: 'spot',
      name: '성산일출봉',
      address: '제주특별자치도 서귀포시 성산읍 성산리 1',
      road_address: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
      lat: 33.4581,
      lng: 126.9425,
      provider: 'naver',
      provider_link: 'https://map.naver.com/p/1',
    })

    expect(saved.id).toBe(seongsanId)
    expect(saved.provider).toBe('naver')
    expect(saved.provider_link).toBe('https://map.naver.com/p/1')
    expect(saved.road_address).toContain('일출로')
    expect(Number(saved.lat)).toBeCloseTo(33.4581, 6)
  })

  it('같은 이름·좌표를 또 담으면 중복으로 막고 기존 항목을 알려준다', async () => {
    const failure = await savePlace(client, {
      id: crypto.randomUUID(),
      trip_id: tripId,
      owner_id: ownerId,
      category: 'restaurant', // 카테고리가 달라도 (trip,name,lat,lng) 가 같으면 중복
      name: '성산일출봉',
      address: '제주특별자치도 서귀포시 성산읍 성산리 1',
      road_address: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
      lat: 33.4581,
      lng: 126.9425,
      provider: 'naver',
      provider_link: null,
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(PlaceError)
    expect((failure as PlaceError).code).toBe('conflict/duplicate')
    expect((failure as PlaceError).existingPlaceId).toBe(seongsanId)
  })

  it('Trip Bundle 은 삭제한 Place 를 빼고, Stop 없는 Place 만 보관함에 남긴다 (FR-005)', async () => {
    await savePlace(client, {
      id: hotelId,
      trip_id: tripId,
      owner_id: ownerId,
      category: 'lodging',
      name: '호텔제주',
      address: '제주특별자치도 제주시',
      road_address: '제주특별자치도 제주시 노형로 1',
      lat: 33.4996,
      lng: 126.5312,
      provider: 'naver',
      provider_link: null,
    })
    await savePlace(client, {
      id: deletedId,
      trip_id: tripId,
      owner_id: ownerId,
      category: 'spot',
      name: '지운 장소',
      address: '제주특별자치도',
      road_address: '제주특별자치도',
      lat: 33.51,
      lng: 126.52,
      provider: 'manual',
      provider_link: null,
    })
    await client
      .from('places')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deletedId)

    const { data: days } = await client.from('days').select('id').eq('trip_id', tripId).order('position')
    const { error: stopError } = await client.from('stops').insert({
      id: crypto.randomUUID(),
      day_id: days![0].id,
      place_id: hotelId,
      position: 0,
    })
    expect(stopError).toBeNull()

    const bundle = await fetchTripBundle(client, tripId)

    expect(bundle.name).toBe('캔버스 여행')
    expect(bundle.days).toHaveLength(2)
    expect(bundle.places.map((p) => p.id).sort()).toEqual([hotelId, seongsanId].sort())
    expect(unassignedPlaces(bundle).map((p) => p.id)).toEqual([seongsanId])
  })

  it('없는 여행은 not-found 로 알린다', async () => {
    await expect(fetchTripBundle(client, crypto.randomUUID())).rejects.toMatchObject({
      code: 'not-found',
    })
  })
})

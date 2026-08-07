// T6-4a (docs/design/06 변환표 FR-004·FR-018) — 로컬 Supabase 대상 integration.
// 실제 Storage 업로드 → public URL 200 → photos 행 → parent-exclusive 거부 → 실패 시 정리.
// 리사이즈는 브라우저 canvas 가 필요하므로 여기서는 이미 만들어진 WebP 를 주입한다.

import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { savePlace } from '@/lib/place/api'
import { signInWithOtpCode, uniqueTestEmail, SUPABASE_URL } from '@/test-support/supabase-local'
import { createTrip } from '@/lib/trips/api'
import { fetchTripBundle } from '@/lib/trips/bundle'
import type { PreparedTripPhoto } from './resize'
import {
  PHOTO_BUCKET,
  deletePhoto,
  photoObjectName,
  photoPublicUrl,
  setCoverPhoto,
  uploadTripPhoto,
} from './upload'

// 실제 WebP 헤더 12바이트 + 패딩 — 버킷의 allowed_mime_types 는 contentType 으로 판정한다
function webpBlob(size: number): Blob {
  const bytes = new Uint8Array(size)
  bytes.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], 0)
  return new Blob([bytes], { type: 'image/webp' })
}

const prepared: PreparedTripPhoto = {
  full: { blob: webpBlob(4_096), width: 1600, height: 1200 },
  thumb: { blob: webpBlob(512), width: 320, height: 240 },
}

const deps = { prepare: async () => prepared }

describe('E-05 사진 업로드 (FR-004)', () => {
  let client: SupabaseClient
  let ownerId: string
  const tripId = crypto.randomUUID()
  const placeId = crypto.randomUUID()

  beforeAll(async () => {
    client = await signInWithOtpCode(uniqueTestEmail('photo'))
    ownerId = (await client.auth.getUser()).data.user!.id

    await createTrip(client, {
      id: tripId,
      name: '사진 여행',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
    })
    await savePlace(client, {
      id: placeId,
      trip_id: tripId,
      owner_id: ownerId,
      category: 'restaurant',
      name: '흑돼지집',
      address: '제주특별자치도 제주시 연동 1',
      road_address: '제주특별자치도 제주시 노형로 1',
      lat: 33.4996,
      lng: 126.5312,
      provider: 'naver',
      provider_link: null,
    })
  }, 40_000)

  it('첫 사진은 대표가 되고, public URL 로 바로 열린다 (결정 #12)', async () => {
    const photo = await uploadTripPhoto(
      client,
      { file: webpBlob(4_096), target: { place_id: placeId } },
      deps,
    )

    expect(photo.is_cover).toBe(true)
    expect(photo.storage_path).toMatch(/^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/)

    // 로그인 없이(=쿠키 없는 fetch) 열려야 공유 뷰·오프라인 캐시가 성립한다
    const full = await fetch(photoPublicUrl(photo.storage_path, SUPABASE_URL))
    expect(full.status).toBe(200)
    expect(full.headers.get('content-type')).toContain('image/webp')

    const thumb = await fetch(photoPublicUrl(photo.thumb_path, SUPABASE_URL))
    expect(thumb.status).toBe(200)

    const bundle = await fetchTripBundle(client, tripId)
    expect(bundle.places[0].photos.map((p) => p.id)).toEqual([photo.id])
  })

  it('두 번째 사진은 대표가 아니고, 대표는 나중에 바꿀 수 있다', async () => {
    const second = await uploadTripPhoto(
      client,
      { file: webpBlob(4_096), target: { place_id: placeId } },
      deps,
    )
    expect(second.is_cover).toBe(false)

    await setCoverPhoto(client, { placeId, photoId: second.id })

    const bundle = await fetchTripBundle(client, tripId)
    const covers = bundle.places[0].photos.filter((p) => p.is_cover).map((p) => p.id)
    expect(covers).toEqual([second.id])
  })

  it('Place 와 Leg 를 함께 붙이려 하면 DB 가 막는다 (parent-exclusive — 결정 #18)', async () => {
    const id = crypto.randomUUID()
    const { data: days } = await client.from('days').select('id').eq('trip_id', tripId).order('position')
    const legId = crypto.randomUUID()
    const { error: legError } = await client.from('legs').insert({
      id: legId,
      day_id: days![0].id,
      mode: 'train',
      depart_at: '09:00',
      arrive_at: '10:00',
      position: 1,
    })
    expect(legError).toBeNull()

    const { error } = await client.from('photos').insert({
      id,
      place_id: placeId,
      leg_id: legId,
      storage_path: `photos/${id}/${id}.webp`,
      thumb_path: `photos/${id}/${id}-thumb.webp`,
    })

    expect(error?.code).toBe('23514')
  })

  it('행을 남기지 못하면 올린 파일을 도로 치운다 (E-05 실패 정리)', async () => {
    const orphanTarget = crypto.randomUUID() // 존재하지 않는 Place — photos 의 FK 가 막는다
    let storagePath = ''

    const failure = await uploadTripPhoto(
      client,
      { file: webpBlob(4_096), target: { place_id: orphanTarget } },
      {
        ...deps,
        newId: () => {
          const id = crypto.randomUUID()
          storagePath = `photos/${id}/${id}.webp`
          return id
        },
      },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    const response = await fetch(photoPublicUrl(storagePath, SUPABASE_URL))
    expect(response.ok).toBe(false)
  })

  it('무작위 경로 형식을 벗어난 업로드는 정책이 막는다 (결정 #12)', async () => {
    const { error } = await client.storage
      .from(PHOTO_BUCKET)
      .upload('holidays/beach.webp', webpBlob(512), { contentType: 'image/webp' })

    expect(error).not.toBeNull()
  })

  it('버킷은 WebP 만 받는다 (E-05 storage/bad-mime)', async () => {
    const id = crypto.randomUUID()
    const { error } = await client.storage
      .from(PHOTO_BUCKET)
      .upload(photoObjectName(`photos/${id}/${id}.webp`), new Blob(['x'], { type: 'text/plain' }), {
        contentType: 'text/plain',
      })

    expect(error).not.toBeNull()
  })

  // ── T7-3 (06 변환표 FR-018) ────────────────────────────────────────────────
  it('Leg 에 담은 예매 캡처는 같은 파이프라인을 타고 Trip Bundle 의 legs 에 실린다 (FR-018)', async () => {
    const { data: days } = await client.from('days').select('id').eq('trip_id', tripId).order('position')
    const legId = crypto.randomUUID()
    const { error: legError } = await client.from('legs').insert({
      id: legId,
      day_id: days![0].id,
      mode: 'train',
      depart_at: '09:00',
      arrive_at: '11:30',
      position: 5,
    })
    expect(legError).toBeNull()

    const photo = await uploadTripPhoto(
      client,
      { file: webpBlob(4_096), target: { leg_id: legId } },
      deps,
    )

    expect(photo.is_cover).toBe(true)
    expect(photo.thumb_path).toMatch(/-thumb\.webp$/)
    expect((await fetch(photoPublicUrl(photo.thumb_path, SUPABASE_URL))).status).toBe(200)

    const bundle = await fetchTripBundle(client, tripId)
    const leg = bundle.days[0].legs.find((item) => item.id === legId)
    expect(leg?.photos.map((p) => p.id)).toEqual([photo.id])
    // Place 사진과 섞이지 않는다 — 첨부 대상은 하나뿐이다 (E-05 parent-exclusive)
    expect(bundle.places[0].photos.map((p) => p.id)).not.toContain(photo.id)
  })

  it('사진을 지우면 photos 행과 파일이 함께 사라진다 (E-12 hard delete)', async () => {
    const photo = await uploadTripPhoto(
      client,
      { file: webpBlob(4_096), target: { place_id: placeId } },
      deps,
    )
    expect((await fetch(photoPublicUrl(photo.storage_path, SUPABASE_URL))).status).toBe(200)

    await deletePhoto(client, photo)

    const { count } = await client
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('id', photo.id)
    expect(count).toBe(0)
    expect((await fetch(photoPublicUrl(photo.storage_path, SUPABASE_URL))).ok).toBe(false)
    expect((await fetch(photoPublicUrl(photo.thumb_path, SUPABASE_URL))).ok).toBe(false)
  })
})

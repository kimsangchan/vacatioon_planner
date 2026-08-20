// 노드 쪽 시드·정리. UI 로 만들면 느리기만 한 사전 상태(SC-004 의 Stop 8 + Leg 3)를
// 여기서 바로 만든다. 앱과 같은 계약 함수(E-02·E-04·E-07·E-08)를 쓰므로 시드가 화면과 어긋날 수 없다.
//
// service role 키는 쓰지 않는다 — 로그인한 사용자 권한(RLS)으로만 넣는다 (decision-log #11).
// 정리도 전역 wipe 가 아니라 "이 테스트가 만든 Trip 한 건"만 지운다 (사용자 실데이터 보존).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlaceCategory } from '../../src/lib/place/category'
import { savePlace } from '../../src/lib/place/api'
import { placeStops, saveLeg, type LegMode } from '../../src/lib/timeline/api'
import { createTrip } from '../../src/lib/trips/api'
import { fetchTripBundle } from '../../src/lib/trips/bundle'
import { signInWithOtpCode } from '../../src/test-support/supabase-local'
import { PHOTO_WEBP, PHOTO_WEBP_THUMB } from './images'

// lib/photo/upload.ts 의 photoPaths 와 같은 어휘 — 0001 photos CHECK·0004 storage 정책이 강제한다
const PHOTO_BUCKET = 'photos'

export interface E2eUser {
  client: SupabaseClient
  ownerId: string
  email: string
}

export async function signInNode(email: string): Promise<E2eUser> {
  const client = await signInWithOtpCode(email)
  const { data } = await client.auth.getUser()
  return { client, ownerId: data.user!.id, email }
}

export interface SeededTrip {
  tripId: string
  dayIds: string[]
}

export async function seedTrip(
  user: E2eUser,
  input: { name: string; startDate: string; endDate: string },
): Promise<SeededTrip> {
  const tripId = crypto.randomUUID()
  await createTrip(user.client, {
    id: tripId,
    name: input.name,
    start_date: input.startDate,
    end_date: input.endDate,
  })

  const bundle = await fetchTripBundle(user.client, tripId)
  return { tripId, dayIds: bundle.days.map((day) => day.id) }
}

export interface PlaceSeed {
  name: string
  category: PlaceCategory
  lat: number
  lng: number
}

export async function seedPlaces(
  user: E2eUser,
  tripId: string,
  seeds: PlaceSeed[],
): Promise<string[]> {
  const ids: string[] = []
  for (const seed of seeds) {
    const id = crypto.randomUUID()
    await savePlace(user.client, {
      id,
      trip_id: tripId,
      owner_id: user.ownerId,
      category: seed.category,
      name: seed.name,
      address: '제주특별자치도 제주시',
      road_address: `제주특별자치도 제주시 시드로 ${ids.length + 1}`,
      lat: seed.lat,
      lng: seed.lng,
      provider: 'naver',
      provider_link: null,
      phone: '',
    })
    ids.push(id)
  }
  return ids
}

export interface StopSeed {
  placeId: string
  position: number
  startTime: string
  cost: number | null
}

export async function seedStops(user: E2eUser, dayId: string, seeds: StopSeed[]): Promise<void> {
  await placeStops(
    user.client,
    seeds.map((seed) => ({
      id: crypto.randomUUID(),
      day_id: dayId,
      place_id: seed.placeId,
      position: seed.position,
      start_time: seed.startTime,
      cost_amount: seed.cost,
    })),
  )
}

export interface LegSeed {
  position: number
  mode: LegMode
  departAt: string
  arriveAt: string
  from: string
  to: string
  cost: number | null
}

export async function seedLegs(user: E2eUser, dayId: string, seeds: LegSeed[]): Promise<void> {
  for (const seed of seeds) {
    await saveLeg(user.client, {
      id: crypto.randomUUID(),
      day_id: dayId,
      position: seed.position,
      mode: seed.mode,
      depart_at: seed.departAt,
      arrive_at: seed.arriveAt,
      arrive_day_offset: 0,
      from_label: seed.from,
      to_label: seed.to,
      booking_ref: '',
      cost_amount: seed.cost,
      memo: '',
    })
  }
}

// SC-002 는 "썸네일 프리페치가 끝난 상태"가 전제다. 업로드 파이프라인(리사이즈)은 T2-4·T6-4 가
// 덮으므로, 여기서는 그 결과물(WebP 본 + 320px 썸네일)을 그대로 올려 상태만 만든다.
export async function seedPlacePhoto(user: E2eUser, placeId: string): Promise<void> {
  const photoId = crypto.randomUUID()
  const objectName = `${photoId}/${photoId}.webp`
  const thumbName = `${photoId}/${photoId}-thumb.webp`

  for (const [name, bytes] of [
    [objectName, PHOTO_WEBP],
    [thumbName, PHOTO_WEBP_THUMB],
  ] as const) {
    const { error } = await user.client.storage
      .from(PHOTO_BUCKET)
      .upload(name, bytes, { contentType: 'image/webp', upsert: false })
    if (error) throw error
  }

  const { error } = await user.client.from('photos').insert({
    id: photoId,
    place_id: placeId,
    storage_path: `${PHOTO_BUCKET}/${objectName}`,
    thumb_path: `${PHOTO_BUCKET}/${thumbName}`,
    is_cover: true,
  })
  if (error) throw error
}

// 이 테스트가 만든 Trip 한 건만 지운다. days·places·stops·legs·photos 는 FK ON DELETE CASCADE 로
// 함께 간다 (0001_schema.sql) — 남는 건 storage 파일뿐이라 그것만 먼저 걷어낸다.
export async function dropTrip(user: E2eUser, tripId: string): Promise<void> {
  const objectNames = await tripPhotoObjectNames(user, tripId)
  if (objectNames.length > 0) {
    await user.client.storage.from(PHOTO_BUCKET).remove(objectNames)
  }

  const { error } = await user.client.from('trips').delete().eq('id', tripId)
  if (error) throw error
}

async function tripPhotoObjectNames(user: E2eUser, tripId: string): Promise<string[]> {
  const bundle = await fetchTripBundle(user.client, tripId).catch(() => null)
  if (!bundle) return []

  const photos = [
    ...bundle.places.flatMap((place) => place.photos),
    ...bundle.days.flatMap((day) => day.legs.flatMap((leg) => leg.photos)),
  ]

  return photos.flatMap((photo) =>
    [photo.storage_path, photo.thumb_path].map((path) =>
      path.startsWith(`${PHOTO_BUCKET}/`) ? path.slice(PHOTO_BUCKET.length + 1) : path,
    ),
  )
}

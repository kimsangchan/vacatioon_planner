// E-06 Trip Bundle — 캔버스·타임라인·보관함이 쓰는 단일 조회 (docs/design/05 엔드포인트 표).
// places 임베드의 deleted_at IS NULL 필터는 필수다 — 지운 장소가 핀·보관함에 되살아나면 안 된다.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Pin } from '@/lib/map/provider'
import type { PlaceCategory } from '@/lib/place/category'
import type { PlaceProvider } from '@/lib/place/api'
import type { LegMode } from '@/lib/timeline/api'
import { TripError, toTripError } from './api'

// legs 임베드에도 photos 를 딸려 온다 — 예매 캡처가 타임라인에서 바로 보여야 하고(FR-018),
// 그러자고 카드마다 조회를 늘리면 E-06 "단일 쿼리"가 깨진다
export const TRIP_BUNDLE_SELECT =
  '*,days(*,stops(*,place:places(*,photos(*))),legs(*,photos(*))),places(*,photos(*))'

export interface PhotoRow {
  id: string
  storage_path: string
  thumb_path: string
  is_cover: boolean
}

export interface PlaceRow {
  id: string
  trip_id: string
  category: PlaceCategory
  name: string
  address: string
  road_address: string
  lat: number
  lng: number
  provider: PlaceProvider
  provider_link: string | null
  memo: string
  photos: PhotoRow[]
}

export interface StopRow {
  id: string
  day_id: string
  place_id: string
  position: number
  start_time: string | null // 'HH:MM(:SS)' 벽시계 값 — 표시 정보, 정렬 키 아님 (결정 #15)
  cost_amount: number | null // 원 단위 정수 — 방문 지출 (결정 #24)
  note: string
  place?: PlaceRow | null
}

export interface LegRow {
  id: string
  day_id: string
  mode: LegMode
  depart_at: string
  arrive_at: string
  arrive_day_offset: number
  from_label: string
  to_label: string
  booking_ref: string
  cost_amount: number | null
  memo: string
  position: number
  photos: PhotoRow[] // 예매 확인·티켓 캡처 (FR-018 — place 사진과 같은 파이프라인)
}

export interface DayRow {
  id: string
  trip_id: string
  date: string
  position: number
  stops: StopRow[]
  legs: LegRow[]
}

export interface TripBundle {
  id: string
  name: string
  start_date: string
  end_date: string
  timezone: string
  days: DayRow[]
  places: PlaceRow[]
}

export function tripBundleKey(tripId: string): readonly [string, string] {
  return ['trip-bundle', tripId] as const
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

export async function fetchTripBundle(
  client: SupabaseClient,
  tripId: string,
): Promise<TripBundle> {
  const { data, error } = await client
    .from('trips')
    .select(TRIP_BUNDLE_SELECT)
    .eq('id', tripId)
    .is('deleted_at', null)
    .is('places.deleted_at', null)
    .maybeSingle()

  if (error) throw toTripError(error)
  if (!data) throw new TripError('not-found')

  const bundle = data as unknown as TripBundle

  return {
    id: bundle.id,
    name: bundle.name,
    start_date: bundle.start_date,
    end_date: bundle.end_date,
    timezone: bundle.timezone,
    places: (bundle.places ?? []).map((place) => ({ ...place, photos: place.photos ?? [] })),
    days: (bundle.days ?? []).slice().sort(byPosition).map((day) => ({
      ...day,
      stops: (day.stops ?? []).slice().sort(byPosition),
      legs: (day.legs ?? [])
        .slice()
        .sort(byPosition)
        .map((leg) => ({ ...leg, photos: leg.photos ?? [] })),
    })),
  }
}

// 보관함(Unassigned) = 어느 Day 의 Stop 으로도 쓰이지 않은 Place
function assignedPlaceIds(bundle: TripBundle): Set<string> {
  const ids = new Set<string>()
  for (const day of bundle.days ?? []) {
    for (const stop of day.stops ?? []) ids.add(stop.place_id)
  }
  return ids
}

export function unassignedPlaces(bundle: TripBundle): PlaceRow[] {
  const assigned = assignedPlaceIds(bundle)
  return (bundle.places ?? []).filter((place) => !assigned.has(place.id))
}

export function assignedPlaces(bundle: TripBundle): PlaceRow[] {
  const assigned = assignedPlaceIds(bundle)
  return (bundle.places ?? []).filter((place) => assigned.has(place.id))
}

// 카드 썸네일의 출처. 대표 지정이 없으면 먼저 담은 사진을 쓴다 — 사진이 없으면 null 이고,
// 그때는 카테고리 자리표시가 대신 선다 (PRD 엣지케이스 — 기능은 성립)
export function coverPhoto(place: Pick<PlaceRow, 'photos'>): PhotoRow | null {
  const photos = place.photos ?? []
  return photos.find((photo) => photo.is_cover) ?? photos[0] ?? null
}

// 캔버스가 열릴 때 미리 받아 둘 썸네일들 (SC-002 — 호버 경로에 네트워크 왕복 0).
// Leg 의 예매 캡처도 같이 받아 둔다 — 타임라인은 탭 전환 한 번이면 열린다
export function thumbPaths(bundle: TripBundle): string[] {
  const fromPlaces = (bundle.places ?? []).flatMap((place) =>
    (place.photos ?? []).map((photo) => photo.thumb_path),
  )
  const fromLegs = (bundle.days ?? []).flatMap((day) =>
    (day.legs ?? []).flatMap((leg) => (leg.photos ?? []).map((photo) => photo.thumb_path)),
  )
  return [...fromPlaces, ...fromLegs]
}

// numeric(9,6) 은 PostgREST 에서 문자열로 올 수 있다 — 지도에 넘기기 전에 숫자로 고정한다
export function toPins(places: PlaceRow[], highlightedId: string | null): Pin[] {
  return places.map((place) => ({
    id: place.id,
    latLng: { lat: Number(place.lat), lng: Number(place.lng) },
    category: place.category,
    selected: place.id === highlightedId,
  }))
}

// E-06 Trip Bundle — 캔버스·타임라인·보관함이 쓰는 단일 조회 (docs/design/05 엔드포인트 표).
// places 임베드의 deleted_at IS NULL 필터는 필수다 — 지운 장소가 핀·보관함에 되살아나면 안 된다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { dayColorOf, dayColorVar } from '@/lib/map/day-color'
import { CATEGORY_COLOR_VAR, type Pin } from '@/lib/map/provider'
import type { PlaceCategory } from '@/lib/place/category'
import type { PlaceProvider } from '@/lib/place/api'
import type { LegMode } from '@/lib/timeline/api'
import { TripError, toTripError } from './api'

// legs 임베드에도 photos 를 딸려 온다 — 예매 캡처가 타임라인에서 바로 보여야 하고(FR-018),
// 그러자고 카드마다 조회를 늘리면 E-06 "단일 쿼리"가 깨진다
export const TRIP_BUNDLE_SELECT =
  '*,days(*,stops(*,place:places(*,photos(*))),legs(*,photos(*))),places(*,photos(*),place_votes(*))'

import type { VoteRow } from '@/lib/vote/api'

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
  /** 업종 원문 — "한식>국수" (결정 #62). 직접 찍은 곳은 빈 문자열 */
  category_label: string
  /** 네이버 검색 결과가 비어 있으면 사용자가 직접 적을 수 있는 전화번호 */
  phone: string
  /** 공개 검색 결과와 별개로 사용자가 직접 적는 여러 줄 영업시간 */
  opening_hours: string
  memo: string
  /** 원 단위 정수 — 이 장소에서 쓸 것 같은 돈. 실제 지출(stops.cost_amount)과 다른 값이다 (결정 #39) */
  estimated_cost: number | null
  photos: PhotoRow[]
  /** 별표 협의 (결정 #46). 주인은 자기 여행의 표를 다 본다 */
  place_votes?: VoteRow[]
}

export interface StopRow {
  id: string
  day_id: string
  place_id: string
  position: number
  start_time: string | null // 'HH:MM(:SS)' 벽시계 값 — 표시 정보, 정렬 키 아님 (결정 #15)
  cost_amount: number | null // 원 단위 정수 — 방문 지출 (결정 #24)
  confirmed: boolean // 확정된 방문만 경로를 잇는다 (결정 #47)
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
  /** 일차 색 토큰 (결정 #41). null 이면 앱이 position 으로 기본색을 준다 */
  color: string | null
  stops: StopRow[]
  legs: LegRow[]
}

/**
 * 핀을 그리는 데 필요한 것만. 공유 화면의 day 는 이동이 좁아(0017) `DayRow` 가 아니지만
 * 핀은 stops·position·color 만 보므로 그대로 들어맞는다.
 */
export type DayPins = Pick<DayRow, 'id' | 'position' | 'color' | 'stops'>

export interface TripBundle {
  id: string
  name: string
  start_date: string
  end_date: string
  timezone: string
  /** 공유 링크가 켜져 있는지 (결정 #3). 주인만 읽는다 — get_shared_trip 은 이 둘을 안 내보낸다 */
  share_enabled?: boolean
  share_token?: string | null
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
    // 공유 상태 (결정 #3) — 주인만 읽는다. 여기서 빠뜨리면 링크를 켜도 화면이 안 따라온다
    share_enabled: bundle.share_enabled ?? false,
    share_token: bundle.share_token ?? null,
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

// numeric(9,6) 은 PostgREST 에서 문자열로 올 수 있다 — 지도에 넘기기 전에 숫자로 고정한다.
//
// 핀의 두 채널 (결정 #41): **색 = 몇 일차인가**, **모양 = 무엇을 하는 곳인가**.
// 일차에 배치된 곳은 일차 색 + 일차 번호를, 보관함은 카테고리 색 + 카테고리 아이콘을 단다.
// 한 장소가 여러 일차에 있으면 가장 이른 일차를 단다 — 좌표가 같아 핀은 하나뿐이다.
export function toPins(places: PlaceRow[], highlightedId: string | null, days: DayPins[]): Pin[] {
  // 핀이 나르는 두 채널: **색 = 몇 일차**(#41) · **숫자 = 그 날 몇 번째 방문**(#49).
  // 예전에는 숫자도 일차였는데, 색이 이미 같은 말을 하고 있어 한 일차의 핀이 전부 같은 숫자였다 —
  // 그래서 지도만 보고는 어디부터 도는지 알 수 없었다 (사용자 지적).
  const placed = new Map<string, { day: DayPins; order: number }>()
  for (const day of [...days].sort((a, b) => a.position - b.position)) {
    const stops = [...(day.stops ?? [])].sort((a, b) => a.position - b.position)
    stops.forEach((stop, index) => {
      // 같은 곳을 여러 날에 담을 수 있다 (#21) — 먼저 만나는 날의 순서를 쓴다
      if (!placed.has(stop.place_id)) placed.set(stop.place_id, { day, order: index + 1 })
    })
  }

  return places.map((place) => {
    const at = placed.get(place.id)
    return {
      id: place.id,
      label: place.name,
      latLng: { lat: Number(place.lat), lng: Number(place.lng) },
      category: place.category,
      selected: place.id === highlightedId,
      orderNumber: at ? at.order : null,
      color: at ? dayColorVar(dayColorOf(at.day)) : CATEGORY_COLOR_VAR[place.category],
    }
  })
}

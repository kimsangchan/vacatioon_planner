// E-04 장소 저장 (docs/design/05 엔드포인트 표). PostgREST 오류를 계약 코드로 정규화해서
// UI 가 항상 "다음 행동"을 붙일 수 있게 한다 — lib/trips/api.ts 와 같은 어휘·같은 모양.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlaceCategory } from './category'

export type PlaceProvider = 'naver' | 'kakao' | 'google' | 'manual'

export interface NewPlace {
  id: string // 클라이언트 생성 UUID — 재시도해도 한 행 (05 §멱등성)
  trip_id: string
  owner_id: string
  category: PlaceCategory
  name: string
  address: string
  road_address: string
  lat: number
  lng: number
  provider: PlaceProvider
  provider_link: string | null
  /** 네이버 업종 원문 (결정 #62). 직접 찍은 곳은 빈 문자열이다 */
  category_label?: string
  phone?: string
  opening_hours?: string
  memo?: string
}

export interface SavedPlace {
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
  phone: string
  opening_hours: string
  memo: string
  /** 원 단위 정수 — 이 장소에서 쓸 것 같은 돈 (결정 #39). 실제 지출은 stops.cost_amount */
  estimated_cost: number | null
}

export type PlaceErrorCode =
  | 'conflict/duplicate'
  | 'validation/coords'
  | 'validation/opening-hours'
  | 'not-found'
  | 'unknown'

export class PlaceError extends Error {
  readonly code: PlaceErrorCode
  // 중복일 때 "담아둔 곳 보기"로 데려갈 대상 (덮어쓰기 금지 — PRD 엣지케이스)
  readonly existingPlaceId?: string

  constructor(code: PlaceErrorCode, message?: string, existingPlaceId?: string) {
    super(message ?? code)
    this.name = 'PlaceError'
    this.code = code
    this.existingPlaceId = existingPlaceId
  }
}

const MESSAGES: Record<PlaceErrorCode, string> = {
  'conflict/duplicate': '이미 담아둔 곳이에요. 보관함에서 확인해 주세요.',
  'validation/coords': '좌표가 국내 범위를 벗어났어요. 지도에서 위치를 확인해 주세요.',
  'validation/opening-hours': '영업시간은 2,000자 안으로 적어 주세요.',
  'not-found': '그 장소를 찾지 못했어요. 보관함에서 다시 골라 주세요.',
  unknown: '보관함에 담지 못했어요. 잠시 뒤에 다시 해 주세요.',
}

export function placeErrorMessage(code: PlaceErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.unknown
}

interface DataLayerError {
  message: string
  code?: string
}

export function toPlaceError(error: DataLayerError, existingPlaceId?: string): PlaceError {
  if (error.code === '23505') {
    return new PlaceError('conflict/duplicate', error.message, existingPlaceId)
  }
  // lat·lng CHECK 제약 (0001_schema.sql) — WGS84 국내 범위 밖
  if (error.code === '23514' && /lat|lng/.test(error.message)) {
    return new PlaceError('validation/coords', error.message)
  }
  // PGRST116 = 한 행을 기대했는데 0행 (RLS 로 안 보이는 경우 포함)
  if (error.code === 'PGRST116') return new PlaceError('not-found', error.message)
  return new PlaceError('unknown', error.message)
}

const SAVED_COLUMNS =
  'id,trip_id,category,name,address,road_address,lat,lng,provider,provider_link,phone,opening_hours,memo,estimated_cost'

const OPENING_HOURS_MAX_LENGTH = 2000

function normalizeOpeningHours(openingHours: string): string {
  const normalized = openingHours.trim()
  if (Array.from(normalized).length > OPENING_HOURS_MAX_LENGTH) {
    throw new PlaceError('validation/opening-hours')
  }
  return normalized
}

export async function savePlace(client: SupabaseClient, input: NewPlace): Promise<SavedPlace> {
  const openingHours =
    input.opening_hours === undefined ? undefined : normalizeOpeningHours(input.opening_hours)
  const { data, error } = await client
    .from('places')
    .insert({
      memo: '',
      ...input,
      ...(openingHours === undefined ? {} : { opening_hours: openingHours }),
    })
    .select(SAVED_COLUMNS)
    .single()

  if (error) {
    const existingPlaceId =
      error.code === '23505' ? await findExistingPlaceId(client, input) : undefined
    throw toPlaceError(error, existingPlaceId)
  }

  return data as SavedPlace
}

// E-09 부분 갱신 (FR-009). 메모는 카드·바텀시트에서 바로 고친다 — 별도 화면을 만들지 않는다
export async function updatePlaceMemo(
  client: SupabaseClient,
  placeId: string,
  memo: string,
): Promise<SavedPlace> {
  const { data, error } = await client
    .from('places')
    .update({ memo: memo.trim() })
    .eq('id', placeId)
    .select(SAVED_COLUMNS)
    .single()

  if (error) throw toPlaceError(error)
  return data as SavedPlace
}

// 예상 금액 (결정 #39). 메모와 같은 부분 갱신 경로다 — 카드에서 바로 고친다.
// null 은 "안 적었다"이고 0 은 "무료"다. 둘을 뭉개면 경비 합계가 거짓말을 한다.
// 실제 지출은 여기서 손대지 않는다 — 그건 stops.cost_amount 이고 방문에 귀속된다 (#24).
export async function updatePlaceEstimatedCost(
  client: SupabaseClient,
  placeId: string,
  estimatedCost: number | null,
): Promise<SavedPlace> {
  const { data, error } = await client
    .from('places')
    .update({ estimated_cost: estimatedCost })
    .eq('id', placeId)
    .select(SAVED_COLUMNS)
    .single()

  if (error) throw toPlaceError(error)
  return data as SavedPlace
}

// 전화번호 (0014). **손으로 적는다** — 네이버 지역검색의 `telephone` 은 항상 빈 문자열로 온다
// (2026-08-21 실호출 10건 전부. 결정 #52 의 "네이버가 주는데 프록시가 버렸다"는 틀렸다).
// 네이버 상세(`provider_link`)에는 번호가 있으니 한 번 보고 적어 두면 카드에서 바로 건다.
// memo 와 같은 규약: 빈 문자열이 "없음"이다 — null 과 '' 두 가지 없음을 만들지 않는다.
export async function updatePlacePhone(
  client: SupabaseClient,
  placeId: string,
  phone: string,
): Promise<void> {
  const { error } = await client
    .from('places')
    .update({ phone: phone.trim() })
    .eq('id', placeId)
    .select('id')
    .single()

  if (error) throw toPlaceError(error)
}

/** 사용자가 적은 여러 줄 영업시간. 바깥 공백만 걷고 줄바꿈과 내부 간격은 보존한다. */
export async function updatePlaceOpeningHours(
  client: SupabaseClient,
  placeId: string,
  openingHours: string,
): Promise<void> {
  const normalized = normalizeOpeningHours(openingHours)
  const { error } = await client
    .from('places')
    .update({ opening_hours: normalized })
    .eq('id', placeId)
    .select('id')
    .single()

  if (error) throw toPlaceError(error)
}

// E-12 (FR-017) — Place 는 소프트 삭제, 배치된 Stop 은 즉시 삭제.
// 순서가 중요하다: Stop 을 먼저 치워야 중간에 실패해도 "보관함엔 없는데 일정엔 남은" 상태가 안 생긴다.
// Stop 은 되돌아오지 않으므로 UI 가 먼저 알린 뒤에 부른다 (PreviewCard 확인 문구).
export async function softDeletePlace(client: SupabaseClient, placeId: string): Promise<void> {
  const { error: stopError } = await client.from('stops').delete().eq('place_id', placeId)
  if (stopError) throw toPlaceError(stopError)

  const { error } = await client
    .from('places')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', placeId)

  if (error) throw toPlaceError(error)
}

// E-09 — 되돌리기는 deleted_at 을 비운다. 사진은 지운 적이 없어 그대로 딸려 온다
export async function restorePlace(client: SupabaseClient, placeId: string): Promise<void> {
  const { error } = await client.from('places').update({ deleted_at: null }).eq('id', placeId)
  if (error) throw toPlaceError(error)
}

// 부분 유니크 키 (trip_id, name, lat, lng) WHERE deleted_at IS NULL 로 기존 항목을 찾는다
export async function findExistingPlaceId(
  client: SupabaseClient,
  input: Pick<NewPlace, 'trip_id' | 'name' | 'lat' | 'lng'>,
): Promise<string | undefined> {
  const { data } = await client
    .from('places')
    .select('id')
    .eq('trip_id', input.trip_id)
    .eq('name', input.name)
    .eq('lat', input.lat)
    .eq('lng', input.lng)
    .is('deleted_at', null)
    .maybeSingle()

  return (data as { id: string } | null)?.id
}

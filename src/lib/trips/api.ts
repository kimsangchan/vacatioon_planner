// 여행 목록·생성 (docs/design/05 E-13·E-02). PostgREST 오류를 계약 코드로 정규화해서
// UI 가 항상 "다음 행동"을 붙일 수 있게 한다 (05 §규약 — Problem JSON 과 같은 어휘).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDayColor, type DayColor } from '@/lib/map/day-color'
import type { TripDateChange } from './dates'

export interface TripSummary {
  id: string
  name: string
  start_date: string // 'YYYY-MM-DD' 벽시계 값
  end_date: string
  place_count: number
}

export interface TripRow {
  id: string
  name: string
  start_date: string
  end_date: string
  timezone: string
}

// 90일 안이면 되돌릴 수 있는 여행 (FR-017 — 지운 것도 목록에서 손이 닿아야 한다)
export interface DeletedTrip {
  id: string
  name: string
  start_date: string
  end_date: string
  deleted_at: string
}

export interface NewTrip {
  id: string // 클라이언트 생성 UUID — 재시도해도 한 행 (05 §멱등성)
  name: string
  start_date: string
  end_date: string
  timezone?: string
}

export type TripErrorCode =
  | 'validation/date-range'
  | 'validation/name-empty'
  | 'validation/day-color'
  | 'conflict/duplicate'
  | 'not-found'
  | 'unknown'

export class TripError extends Error {
  readonly code: TripErrorCode

  constructor(code: TripErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'TripError'
    this.code = code
  }
}

const MESSAGES: Record<TripErrorCode, string> = {
  'validation/date-range': '끝나는 날이 시작하는 날보다 빨라요. 날짜를 다시 골라 주세요.',
  'validation/name-empty': '여행 이름을 적어 주세요.',
  'validation/day-color': '고를 수 있는 색이 아니에요. 팔레트에서 골라 주세요.',
  'conflict/duplicate': '방금 만든 여행이에요. 목록에서 확인해 주세요.',
  'not-found': '그 여행을 찾지 못했어요. 목록에서 다시 골라 주세요.',
  // toTripError 는 생성·이름변경·삭제·되돌리기·기간변경의 모든 미분류 실패를 여기로 떨어뜨린다.
  // 그래서 문구는 행동 중립이어야 한다 — '만들지 못했어요'는 이름을 고치다 실패한 사람에게 거짓말이다
  // (timeline/api.ts 가 이미 같은 규칙을 따른다)
  unknown: '방금 한 일을 저장하지 못했어요. 잠시 뒤에 다시 해 주세요.',
}

export function tripErrorMessage(code: TripErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.unknown
}

interface DataLayerError {
  message: string
  code?: string
}

// RPC 는 'validation/date-range: ...' 형태로 raise 한다 (supabase/migrations/0003_rpc.sql)
const RAISED_CODES: TripErrorCode[] = ['validation/date-range', 'not-found']

export function toTripError(error: DataLayerError): TripError {
  const raised = RAISED_CODES.find((code) => error.message.includes(code))
  if (raised) return new TripError(raised, error.message)
  if (error.code === '23505') return new TripError('conflict/duplicate', error.message)
  return new TripError('unknown', error.message)
}

interface TripListRow {
  id: string
  name: string
  start_date: string
  end_date: string
  places: { count: number }[] | null
}

// E-13: deleted_at 필터는 trips 와 임베드된 places 양쪽에 건다 —
// 삭제한 장소가 개수에 남으면 안 된다 (05 E-06 주석과 같은 규칙)
export async function listTrips(client: SupabaseClient): Promise<TripSummary[]> {
  const { data, error } = await client
    .from('trips')
    .select('id,name,start_date,end_date,places(count)')
    .is('deleted_at', null)
    .is('places.deleted_at', null)
    .order('start_date', { ascending: true })

  if (error) throw toTripError(error)

  return ((data ?? []) as unknown as TripListRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    place_count: row.places?.[0]?.count ?? 0,
  }))
}

// E-02: trip + 기간만큼의 days 를 단일 트랜잭션으로 만드는 RPC
export async function createTrip(client: SupabaseClient, input: NewTrip): Promise<TripRow> {
  const { data, error } = await client.rpc('create_trip', {
    id: input.id,
    name: input.name.trim(),
    start_date: input.start_date,
    end_date: input.end_date,
    ...(input.timezone ? { timezone: input.timezone } : {}),
  })

  if (error) throw toTripError(error)
  return data as TripRow
}

/** 이름 없는 여행의 이름 — 헤더에서 곧바로 고칠 수 있다 (FR-002) */
export const DRAFT_TRIP_NAME = '제목 없는 여행'

// FR-002: 날짜를 묻지 않고 시작한다. 기간은 오늘 하루로 열어 두고 캔버스 헤더에서 고친다 —
// 여행 계획은 "언제 갈지"보다 "어디 갈지"에서 시작하는 일이 많다 (결정 #27).
export async function createDraftTrip(
  client: SupabaseClient,
  today: string,
): Promise<TripRow> {
  return createTrip(client, {
    // PK 는 클라이언트가 만든다 — 재시도해도 한 행 (05 §멱등성)
    id: crypto.randomUUID(),
    name: DRAFT_TRIP_NAME,
    start_date: today,
    end_date: today,
  })
}

// 이름 바꾸기는 trips_owner_update RLS 로 직접 UPDATE 한다 — 다른 테이블을 건드리지 않으므로
// 트랜잭션(RPC)이 필요 없다 (기간 변경은 days 를 함께 손대므로 E-14 RPC 를 쓴다)
export async function renameTrip(
  client: SupabaseClient,
  tripId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim()
  if (trimmed === '') throw new TripError('validation/name-empty')

  const { error } = await client.from('trips').update({ name: trimmed }).eq('id', tripId)
  if (error) throw toTripError(error)
}

// 일차 색 (결정 #41). 팔레트 밖의 값은 여기서 막는다 — DB CHECK 는 마지막 방어선이지
// 입력 검증의 자리가 아니고, 거기까지 가면 사용자는 원인을 알 수 없는 실패만 본다.
export async function updateDayColor(
  client: SupabaseClient,
  dayId: string,
  color: DayColor | null,
): Promise<void> {
  if (color !== null && !isDayColor(color)) throw new TripError('validation/day-color')

  const { error } = await client.from('days').update({ color }).eq('id', dayId)
  if (error) throw toTripError(error)
}

// E-14: Day 증감 + 삭제 Day 의 Stop 제거를 단일 트랜잭션으로. 부분 실패가 없으니
// 화면은 반환 카운트만 믿고 안내하면 된다 (FR-015)
export async function updateTripDates(
  client: SupabaseClient,
  input: { trip_id: string; start_date: string; end_date: string },
): Promise<TripDateChange> {
  const { data, error } = await client.rpc('update_trip_dates', input)

  if (error) throw toTripError(error)

  // `returns table (...)` 이라 PostgREST 는 한 행짜리 배열로 돌려준다
  const row = (Array.isArray(data) ? data[0] : data) as TripDateChange | undefined
  return {
    removed_stops: row?.removed_stops ?? 0,
    unassigned_places: row?.unassigned_places ?? 0,
  }
}

// E-12: Trip 은 소프트 삭제다 — 목록에서만 사라지고 90일 안에는 되돌릴 수 있다 (FR-017)
export async function softDeleteTrip(client: SupabaseClient, tripId: string): Promise<void> {
  const { error } = await client
    .from('trips')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', tripId)

  if (error) throw toTripError(error)
}

// E-09: 되돌리기는 deleted_at 을 비우는 일 하나뿐이다 — 딸린 것들은 지운 적이 없다
export async function restoreTrip(client: SupabaseClient, tripId: string): Promise<void> {
  const { error } = await client.from('trips').update({ deleted_at: null }).eq('id', tripId)
  if (error) throw toTripError(error)
}

export const TRIP_RESTORE_WINDOW_DAYS = 90

export async function listDeletedTrips(client: SupabaseClient): Promise<DeletedTrip[]> {
  const since = new Date(
    Date.now() - TRIP_RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { data, error } = await client
    .from('trips')
    .select('id,name,start_date,end_date,deleted_at')
    .not('deleted_at', 'is', null)
    .gte('deleted_at', since)
    .order('deleted_at', { ascending: false })

  if (error) throw toTripError(error)
  return (data ?? []) as unknown as DeletedTrip[]
}

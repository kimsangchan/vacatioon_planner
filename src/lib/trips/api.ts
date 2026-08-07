// 여행 목록·생성 (docs/design/05 E-13·E-02). PostgREST 오류를 계약 코드로 정규화해서
// UI 가 항상 "다음 행동"을 붙일 수 있게 한다 (05 §규약 — Problem JSON 과 같은 어휘).

import type { SupabaseClient } from '@supabase/supabase-js'
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
  'conflict/duplicate': '방금 만든 여행이에요. 목록에서 확인해 주세요.',
  'not-found': '그 여행을 찾지 못했어요. 목록에서 다시 골라 주세요.',
  unknown: '여행을 만들지 못했어요. 잠시 뒤에 다시 해 주세요.',
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

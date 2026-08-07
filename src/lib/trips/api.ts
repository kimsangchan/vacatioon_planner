// 여행 목록·생성 (docs/design/05 E-13·E-02). PostgREST 오류를 계약 코드로 정규화해서
// UI 가 항상 "다음 행동"을 붙일 수 있게 한다 (05 §규약 — Problem JSON 과 같은 어휘).

import type { SupabaseClient } from '@supabase/supabase-js'

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

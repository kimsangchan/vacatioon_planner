// E-07 배치·재정렬 + E-08 이동 (docs/design/05 엔드포인트 표).
//
// 두 표면의 역할이 다르다: Stop 만 다루는 배치·해제·수정은 PostgREST 로 직접(PUT stops upsert),
// Stop∪Leg 가 섞이는 순서 변경은 `reorder_day_items` RPC 로 — Day 전체 순서를 한 배열로 받아
// 단일 트랜잭션으로 갈아 끼운다(부분 실패 없음 · 멱등 — 05 §멱등성, 결정 #15).
//
// 오류는 trips/places 와 같은 어휘로 정규화한다 — UI 가 언제나 "다음 행동"을 붙일 수 있게.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LegRow, StopRow } from '@/lib/trips/bundle'

export type LegMode = 'train' | 'bus' | 'flight' | 'ship' | 'car' | 'walk' | 'other'

// 0001_schema.sql 의 legs.mode CHECK 와 같은 7종·같은 순서
export const LEG_MODE_ORDER: LegMode[] = ['train', 'bus', 'flight', 'ship', 'car', 'walk', 'other']

export const LEG_MODE_LABEL: Record<LegMode, string> = {
  train: '기차',
  bus: '버스',
  flight: '항공',
  ship: '배',
  car: '차',
  walk: '도보',
  other: '기타',
}

export interface StopUpsert {
  id: string // 클라이언트 생성 UUID — 재시도해도 한 행 (05 §멱등성)
  day_id: string
  place_id: string
  position: number
  start_time?: string | null
  cost_amount?: number | null
  note?: string
}

// place_id 가 여기 있는 이유 (결정 #53): 자리는 두고 **장소만** 갈아끼우는 것이 교체다.
// 순서·시각·확정·메모는 자리의 것이라 남고, 사진·별표·예상금액은 장소를 따라간다.
// 플랜 A 는 자리를 잃어 보관함으로 돌아간다 — 그래서 후보군을 따로 관리할 상태가 없다.
export type StopPatch = Partial<
  Pick<StopRow, 'start_time' | 'cost_amount' | 'confirmed' | 'note' | 'position' | 'place_id'>
>

// 폼이 만들어 내는 이동 한 건 — 자리(position)와 소속(day_id)은 호출자가 정한다
export interface LegDraft {
  mode: LegMode
  depart_at: string // 'HH:MM' 벽시계 값 (05 §규약 — UTC 변환 금지)
  arrive_at: string
  arrive_day_offset: number // 익일 도착 = 1 (PRD 엣지)
  from_label: string
  to_label: string
  booking_ref: string
  cost_amount: number | null // 원 단위 정수 (결정 #17)
  memo: string
}

export interface LegUpsert extends LegDraft {
  id: string
  day_id: string
  position: number
}

export type TimelineErrorCode =
  | 'validation/position-dup'
  | 'validation/time-reversed'
  | 'validation/cost-negative'
  | 'not-found'
  | 'unknown'

export class TimelineError extends Error {
  readonly code: TimelineErrorCode

  constructor(code: TimelineErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'TimelineError'
    this.code = code
  }
}

const MESSAGES: Record<TimelineErrorCode, string> = {
  'validation/position-dup': '순서를 저장하지 못했어요. 화면을 새로 불러온 뒤 다시 옮겨 주세요.',
  'validation/time-reversed': '도착이 출발보다 일러요. 다음 날 도착인지 확인해 주세요.',
  'validation/cost-negative': '가격은 0원부터 적을 수 있어요. 숫자를 다시 확인해 주세요.',
  'not-found': '그 일정을 찾지 못했어요. 목록에서 다시 골라 주세요.',
  unknown: '방금 한 일을 저장하지 못했어요. 잠시 뒤에 다시 해 주세요.',
}

export function timelineErrorMessage(code: TimelineErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.unknown
}

interface DataLayerError {
  message: string
  code?: string
}

export function toTimelineError(error: DataLayerError): TimelineError {
  const message = error.message ?? ''

  // RPC 는 'validation/position-dup: ...' / 'not-found: day ...' 형태로 raise 한다 (0003_rpc.sql)
  if (message.includes('validation/position-dup')) {
    return new TimelineError('validation/position-dup', message)
  }
  if (message.includes('not-found')) return new TimelineError('not-found', message)

  if (error.code === '23514') {
    // 컬럼 CHECK 이름이 그대로 오므로 어느 계약을 어겼는지 구분할 수 있다 (0001·0005 마이그레이션)
    if (message.includes('cost_amount')) return new TimelineError('validation/cost-negative', message)
    if (message.includes('legs_check')) return new TimelineError('validation/time-reversed', message)
  }
  // 사라진 Day·Place 를 가리키는 배치 (RLS 로 안 보이는 경우 포함)
  if (error.code === '23503' || error.code === 'PGRST116') {
    return new TimelineError('not-found', message)
  }
  return new TimelineError('unknown', message)
}

// 'HH:MM' 제로 패딩 문자열은 사전순 비교 = 시각 비교 (merge.ts 와 같은 규칙)
export function isTimeReversed(departAt: string, arriveAt: string): boolean {
  return arriveAt < departAt
}

const STOP_COLUMNS = 'id,day_id,place_id,position,start_time,cost_amount,confirmed,note'
const LEG_COLUMNS =
  'id,day_id,mode,depart_at,arrive_at,arrive_day_offset,from_label,to_label,booking_ref,cost_amount,memo,position'

// E-07 배치 — 배열 upsert. 같은 UUID 로 다시 보내도 한 행이다
export async function placeStops(
  client: SupabaseClient,
  stops: StopUpsert[],
): Promise<StopRow[]> {
  const { data, error } = await client.from('stops').upsert(stops).select(STOP_COLUMNS)

  if (error) throw toTimelineError(error)
  return (data ?? []) as StopRow[]
}

// Stop 의 시각·가격은 선택 입력이다 — 지우면 null 로 되돌아간다 (FR-007)
export async function updateStop(
  client: SupabaseClient,
  stopId: string,
  patch: StopPatch,
): Promise<StopRow> {
  const { data, error } = await client
    .from('stops')
    .update(patch)
    .eq('id', stopId)
    .select(STOP_COLUMNS)
    .single()

  if (error) throw toTimelineError(error)
  return data as StopRow
}

// 배치 해제 = Stop 만 지운다. Place 는 보관함으로 돌아갈 뿐 사라지지 않는다 (E-12 hard delete)
export async function removeStop(client: SupabaseClient, stopId: string): Promise<void> {
  const { error } = await client.from('stops').delete().eq('id', stopId)
  if (error) throw toTimelineError(error)
}

// E-07 혼합 재정렬 — Day 의 모든 Stop·Leg id 를 원하는 순서대로 넘긴다
export async function reorderDayItems(
  client: SupabaseClient,
  dayId: string,
  orderedIds: string[],
): Promise<void> {
  const { error } = await client.rpc('reorder_day_items', {
    day_id: dayId,
    ordered_ids: orderedIds,
  })

  if (error) throw toTimelineError(error)
}

// E-08 이동 저장(신규·수정 공용). 확인 없는 시각 역전은 네트워크를 타기 전에 막는다 —
// 야간 이동은 익일 도착(+1d)으로 확정해야 저장된다 (PRD 엣지)
export async function saveLeg(client: SupabaseClient, input: LegUpsert): Promise<LegRow> {
  if (input.arrive_day_offset === 0 && isTimeReversed(input.depart_at, input.arrive_at)) {
    throw new TimelineError('validation/time-reversed')
  }
  if (input.cost_amount !== null && input.cost_amount < 0) {
    throw new TimelineError('validation/cost-negative')
  }

  const { data, error } = await client.from('legs').upsert(input).select(LEG_COLUMNS).single()

  if (error) throw toTimelineError(error)
  return data as LegRow
}

export async function removeLeg(client: SupabaseClient, legId: string): Promise<void> {
  const { error } = await client.from('legs').delete().eq('id', legId)
  if (error) throw toTimelineError(error)
}

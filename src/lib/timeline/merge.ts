// Day 타임라인 병합 — 순서의 유일한 진실은 stops∪legs 통합 position이며,
// 시각은 표시 정보일 뿐 정렬 키가 아니다 (docs/design/decision-log.md #15).

export interface StopLike {
  id: string
  position: number
  start_time: string | null // 'HH:MM' 벽시계 값
  cost_amount: number | null // 원 단위 정수 — 방문 지출 (decision-log #24)
  // 확정 여부 (decision-log #47). **생략은 확정으로 본다** — DB 기본값(true)과 같은 뜻이라
  // 이 값을 모르는 호출부가 갑자기 경로를 잃지 않는다
  confirmed?: boolean
}

export interface LegLike {
  id: string
  position: number
  depart_at: string // 'HH:MM'
  arrive_at: string
  arrive_day_offset: number
  cost_amount: number | null // 원 단위 정수 (decision-log #17)
}

export type DayItem = (({ kind: 'stop' } & StopLike) | ({ kind: 'leg' } & LegLike)) & {
  timeWarning: boolean
}

// 비교 시각: Stop=start_time, Leg=depart_at. 익일 도착 Leg의 arrive_at은 같은 Day의
// 시각 축 밖이므로 비교에서 제외한다 (SPEC §알고리즘 2).
function comparableTime(item: DayItem): string | null {
  return item.kind === 'stop' ? item.start_time : item.depart_at
}

export function mergeDayItems(stops: StopLike[], legs: LegLike[]): DayItem[] {
  const items: DayItem[] = [
    ...stops.map((s) => ({ kind: 'stop' as const, ...s, timeWarning: false })),
    ...legs.map((l) => ({ kind: 'leg' as const, ...l, timeWarning: false })),
  ].sort((a, b) => a.position - b.position)

  // 'HH:MM' 제로 패딩 문자열은 사전순 비교 = 시각 비교
  let maxTimeSoFar: string | null = null
  for (const item of items) {
    const t = comparableTime(item)
    if (t === null) continue
    if (maxTimeSoFar !== null && t < maxTimeSoFar) item.timeWarning = true
    else maxTimeSoFar = t
  }
  return items
}

// Day 지출 합계 = Stop(방문) + Leg(이동)의 cost_amount 비-null 합.
// 원 단위 정수만 더한다 — 나눗셈·환산이 없으니 부동소수점이 끼어들 자리도 없다 (#17·#24).
export function dayTotal(stops: StopLike[], legs: LegLike[]): number {
  let total = 0
  for (const item of [...stops, ...legs]) total += item.cost_amount ?? 0
  return total
}

// 새 항목이 들어갈 자리 — Stop·Leg 를 통틀어 맨 뒤다 (통합 시퀀스라 둘을 같이 본다)
export function nextPosition(stops: StopLike[], legs: LegLike[]): number {
  const positions = [...stops, ...legs].map((item) => item.position)
  return positions.length === 0 ? 0 : Math.max(...positions) + 1
}

// 위/아래 한 칸 이동을 reorder_day_items(day_id, ordered_ids[]) 의 입력으로 바꾼다 (E-07).
// 경계 밖·없는 id 는 순서를 그대로 둔다 — 버튼을 눌렀다고 데이터가 흔들리면 안 된다.
export function movedItemIds(items: DayItem[], id: string, delta: -1 | 1): string[] {
  const ids = items.map((item) => item.id)
  const from = ids.indexOf(id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= ids.length) return ids

  ids[from] = ids[to]
  ids[to] = id
  return ids
}

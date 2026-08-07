// Day 타임라인 병합 — 순서의 유일한 진실은 stops∪legs 통합 position이며,
// 시각은 표시 정보일 뿐 정렬 키가 아니다 (docs/design/decision-log.md #15).

export interface StopLike {
  id: string
  position: number
  start_time: string | null // 'HH:MM' 벽시계 값
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

export function daySum(legs: LegLike[]): number {
  return legs.reduce((sum, l) => sum + (l.cost_amount ?? 0), 0)
}

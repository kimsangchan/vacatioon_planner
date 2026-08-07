// FR-015 기간 변경의 말(語) — 계산은 E-14 RPC 가 하고, 여기서는 두 문장만 만든다.
//
// ① 실행 전: 담긴 곳이 있는 Day 가 사라질 때만 묻는다. 데이터는 잃지 않지만(보관함으로 돌아간다)
//    사라지는 걸 미리 알려야 놀라지 않는다 (PRD 엣지 — 데이터 손실 금지).
// ② 실행 후: 반환 카운트 두 개를 구분해 알린다. removed_stops(일정에서 빠진 자리)와
//    unassigned_places(그래서 보관함으로 돌아간 곳)는 다른 수다 — 같은 곳을 여러 날에 담을 수 있으니까.
//
// 날짜는 벽시계 문자열 그대로 다룬다. Date 로 바꾸면 타임존이 끼어든다 (05 §규약).

import type { DayRow } from './bundle'

export interface TripDateChange {
  removed_stops: number
  unassigned_places: number
}

export interface ShrinkImpact {
  /** 새 기간 밖으로 밀려나면서 담긴 게 있는 Day 의 날짜 ('YYYY-MM-DD' 오름차순) */
  dates: string[]
  stops: number
}

type DayLike = Pick<DayRow, 'date' | 'stops'>

// 'YYYY-MM-DD' 는 제로 패딩이라 사전순 비교 = 날짜 비교 (merge.ts 의 시각 비교와 같은 규칙)
export function shrinkImpact(days: DayLike[], startDate: string, endDate: string): ShrinkImpact {
  const dropped = days
    .filter((day) => day.date < startDate || day.date > endDate)
    .filter((day) => (day.stops ?? []).length > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    dates: dropped.map((day) => day.date),
    stops: dropped.reduce((total, day) => total + day.stops.length, 0),
  }
}

const DAY_COUNT_WORD = ['', '하루', '이틀', '사흘', '나흘']

function dayCountWord(count: number): string {
  return DAY_COUNT_WORD[count] ?? `${count}일`
}

// 하루'를' / 이틀'을' — 받침이 있으면 '을'. 세는 말이 바뀌므로 문장에서 고를 수 없다
function objectParticle(word: string): '을' | '를' {
  const code = word.charCodeAt(word.length - 1)
  const hangul = code >= 0xac00 && code <= 0xd7a3
  return hangul && (code - 0xac00) % 28 !== 0 ? '을' : '를'
}

// '2026-08-13' → '8/13'. 여행 화면에서는 연도가 이미 헤더에 있다
function shortDate(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

export function shrinkConfirmMessage(impact: ShrinkImpact): string | null {
  if (impact.dates.length === 0) return null

  const days = dayCountWord(impact.dates.length)
  const when = impact.dates.map(shortDate).join('·')
  return `${when} ${days}${objectParticle(days)} 줄이면 담긴 ${impact.stops}곳이 보관함으로 돌아가요 — 계속할까요?`
}

export function dateChangeNotice(change: TripDateChange): string {
  const { removed_stops: removed, unassigned_places: unassigned } = change

  if (removed === 0) return '기간을 바꿨어요.'
  if (unassigned === 0) {
    return `일정에서 ${removed}곳을 뺐어요. 다른 날에도 담겨 있어 보관함은 그대로예요.`
  }
  if (unassigned === removed) return `일정에서 빠진 곳 ${removed}곳을 보관함으로 옮겼어요.`

  return `일정에서 빠진 곳 ${removed}곳 가운데 ${unassigned}곳을 보관함으로 옮겼어요. 나머지는 다른 날에도 담겨 있어요.`
}

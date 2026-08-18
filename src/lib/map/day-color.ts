// 일차 색 (결정 #41). 지도 핀에서 색은 "몇 일차인가"만 나른다 —
// "무엇을 하는 곳인가"는 모양(숫자/카테고리 아이콘)이 맡는다.
//
// 저장은 토큰(`'rose'`)이고 실제 색값은 globals.css 의 `--day-*` 가 라이트/다크로 갈라 준다.
// 팔레트를 여덟 개로 가두는 이유: 전부 흰 글씨가 읽히는 색이어야 핀 안 숫자가 보인다.

export const DAY_COLORS = [
  'rose',
  'amber',
  'emerald',
  'teal',
  'sky',
  'indigo',
  'violet',
  'slate',
] as const

export type DayColor = (typeof DAY_COLORS)[number]

export const DAY_COLOR_LABEL: Record<DayColor, string> = {
  rose: '분홍',
  amber: '주황',
  emerald: '초록',
  teal: '청록',
  sky: '하늘',
  indigo: '남색',
  violet: '보라',
  slate: '회색',
}

export function isDayColor(value: string | null | undefined): value is DayColor {
  return value != null && (DAY_COLORS as readonly string[]).includes(value)
}

/**
 * 그 일차가 쓸 색. 고르지 않았으면 순서대로 팔레트를 돈다 —
 * 여행을 만들자마자 일차들이 서로 구분돼 보여야 하므로 기본값을 하나로 박지 않는다.
 * 저장된 값이 팔레트 밖이면(마이그레이션 이전 데이터·손상) 기본색으로 물러난다.
 */
export function dayColorOf(day: { color?: string | null; position: number }): DayColor {
  if (isDayColor(day.color)) return day.color
  const index = ((day.position % DAY_COLORS.length) + DAY_COLORS.length) % DAY_COLORS.length
  return DAY_COLORS[index]
}

export function dayColorVar(color: DayColor): string {
  return `var(--day-${color})`
}

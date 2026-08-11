// 달력 범위 선택기의 순수 부분 (FR-015 — 기간 고치기).
//
// 날짜는 'YYYY-MM-DD' 벽시계 문자열로만 오간다. Date 는 이 파일 안에서 계산 도구로만 쓰고
// 밖으로 내보내지 않는다 — UTC 변환이 새면 하루가 밀린다 (05 §규약, dates.ts 와 같은 규칙).
// 그래서 toIsoDate 는 toISOString() 을 쓰지 않고 로컬 달력 필드를 직접 읽는다.

const pad = (value: number) => String(value).padStart(2, '0')

/** Date 의 **로컬** 달력 날짜를 'YYYY-MM-DD' 로. UTC 로 넘어가지 않는다 */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

function parts(iso: string): [number, number, number] {
  const [year, month, day] = iso.split('-').map(Number)
  return [year, month, day]
}

export function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = parts(iso)
  // 로컬 정오 기준 — 서머타임이 있는 지역에서도 날짜가 앞뒤로 튀지 않는다
  const moved = new Date(year, month - 1, day + days, 12)
  return toIsoDate(moved)
}

export function daysBetween(startIso: string, endIso: string): number {
  const [sy, sm, sd] = parts(startIso)
  const [ey, em, ed] = parts(endIso)
  const start = Date.UTC(sy, sm - 1, sd)
  const end = Date.UTC(ey, em - 1, ed)
  return Math.round((end - start) / 86_400_000)
}

/** 일요일 시작 7칸짜리 주들. 그 달에 없는 칸은 null */
export function monthMatrix(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month - 1, 1, 12)
  const lead = first.getDay() // 0 = 일요일
  const lastDay = new Date(year, month, 0, 12).getDate()

  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${year}-${pad(month)}-${pad(day)}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (string | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }
  return weeks
}

export function koreanMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`
}

export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const zero = year * 12 + (month - 1) + delta
  return [Math.floor(zero / 12), (zero % 12) + 1]
}

const NIGHT_WORD = ['하루', '1박 2일', '2박 3일']

/** '하루' · '1박 2일' — 기간을 사람이 세는 말로 */
export function nightsLabel(startIso: string, endIso: string): string {
  const nights = Math.max(0, daysBetween(startIso, endIso))
  return NIGHT_WORD[nights] ?? `${nights}박 ${nights + 1}일`
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

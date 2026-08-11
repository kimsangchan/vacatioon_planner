// 달력 범위 선택기의 순수 부분. 날짜는 'YYYY-MM-DD' 벽시계 문자열로만 다룬다 —
// Date 로 바꿔 계산하면 타임존이 끼어든다 (05 §규약, dates.ts 와 같은 규칙).

import { describe, expect, it } from 'vitest'
import {
  addDaysIso,
  koreanMonthLabel,
  monthMatrix,
  nightsLabel,
  toIsoDate,
} from './calendar'

describe('toIsoDate — 로컬 벽시계 날짜', () => {
  it('UTC 가 아니라 로컬 달력 날짜를 쓴다', () => {
    // KST 09:00 = UTC 00:00. toISOString() 을 썼다면 하루 밀린다
    expect(toIsoDate(new Date(2026, 7, 11, 0, 30))).toBe('2026-08-11')
    expect(toIsoDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01')
  })

  it('월·일을 두 자리로 채운다 — 사전순 비교가 곧 날짜 비교여야 한다', () => {
    expect(toIsoDate(new Date(2026, 8, 5))).toBe('2026-09-05')
  })
})

describe('addDaysIso', () => {
  it('월을 넘긴다', () => {
    expect(addDaysIso('2026-08-30', 3)).toBe('2026-09-02')
  })

  it('해를 넘긴다', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('윤년 2월을 지난다', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysIso('2028-02-28', 2)).toBe('2028-03-01')
  })

  it('음수로 되돌아간다', () => {
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('monthMatrix — 주 단위 격자', () => {
  it('일요일에서 시작하는 7칸짜리 주로 나눈다', () => {
    const weeks = monthMatrix(2026, 8)
    expect(weeks.every((week) => week.length === 7)).toBe(true)
  })

  it('앞뒤 빈칸은 null 이고, 그 달의 날짜만 담는다', () => {
    // 2026-08-01 은 토요일 → 첫 주는 앞 6칸이 비고 1일이 마지막 칸
    const weeks = monthMatrix(2026, 8)
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-08-01'])

    const flat = weeks.flat().filter((cell): cell is string => cell !== null)
    expect(flat).toHaveLength(31)
    expect(flat[0]).toBe('2026-08-01')
    expect(flat.at(-1)).toBe('2026-08-31')
  })

  it('2월도 빠짐없이 담는다 (윤년)', () => {
    expect(monthMatrix(2028, 2).flat().filter(Boolean)).toHaveLength(29)
    expect(monthMatrix(2026, 2).flat().filter(Boolean)).toHaveLength(28)
  })
})

describe('koreanMonthLabel', () => {
  it('연·월을 사람이 읽는 말로', () => {
    expect(koreanMonthLabel(2026, 8)).toBe('2026년 8월')
    expect(koreanMonthLabel(2026, 12)).toBe('2026년 12월')
  })
})

describe('nightsLabel — 며칠짜리인지', () => {
  it('같은 날이면 하루', () => {
    expect(nightsLabel('2026-08-11', '2026-08-11')).toBe('하루')
  })

  it('1박 2일·2박 3일', () => {
    expect(nightsLabel('2026-08-11', '2026-08-12')).toBe('1박 2일')
    expect(nightsLabel('2026-08-11', '2026-08-13')).toBe('2박 3일')
  })

  it('달을 넘겨도 센다', () => {
    expect(nightsLabel('2026-08-30', '2026-09-02')).toBe('3박 4일')
  })
})

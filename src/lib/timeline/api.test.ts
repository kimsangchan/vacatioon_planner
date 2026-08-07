// T7-1·T7-2 — E-07·E-08 계약을 UI 가 쓸 어휘로 정규화하는 층 (docs/design/05 엔드포인트 표).
// 여기 테스트는 네트워크를 타지 않는다 — 매핑과 사전 검증만 본다.

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  LEG_MODE_LABEL,
  LEG_MODE_ORDER,
  TimelineError,
  isTimeReversed,
  saveLeg,
  timelineErrorMessage,
  toTimelineError,
  type LegDraft,
} from './api'

const draft = (o: Partial<LegDraft> = {}): LegDraft => ({
  mode: 'train',
  depart_at: '09:00',
  arrive_at: '11:30',
  arrive_day_offset: 0,
  from_label: '서울역',
  to_label: '목포역',
  booking_ref: '',
  cost_amount: null,
  memo: '',
  ...o,
})

// 어떤 호출이든 오면 실패시킨다 — 사전 검증이 네트워크 앞에서 막았는지 보려는 것
const forbiddenClient = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient

describe('toTimelineError — PostgREST 오류를 계약 코드로', () => {
  it('cost_amount CHECK 위반은 validation/cost-negative', () => {
    const error = toTimelineError({
      code: '23514',
      message: 'new row for relation "legs" violates check constraint "legs_cost_amount_check"',
    })
    expect(error.code).toBe('validation/cost-negative')
  })

  it('Stop 가격 CHECK 위반도 같은 코드다 (결정 #24)', () => {
    const error = toTimelineError({
      code: '23514',
      message: 'new row for relation "stops" violates check constraint "stops_cost_amount_check"',
    })
    expect(error.code).toBe('validation/cost-negative')
  })

  it('도착<출발 CHECK 위반은 validation/time-reversed', () => {
    const error = toTimelineError({
      code: '23514',
      message: 'new row for relation "legs" violates check constraint "legs_check"',
    })
    expect(error.code).toBe('validation/time-reversed')
  })

  it('reorder_day_items 의 raise 는 validation/position-dup', () => {
    const error = toTimelineError({
      message:
        'validation/position-dup: ordered_ids must list every stop and leg of the day exactly once',
    })
    expect(error.code).toBe('validation/position-dup')
  })

  it('없는 day 는 not-found', () => {
    expect(toTimelineError({ message: 'not-found: day 0000' }).code).toBe('not-found')
    expect(toTimelineError({ code: 'PGRST116', message: 'no rows' }).code).toBe('not-found')
  })

  it('모르는 오류는 unknown', () => {
    expect(toTimelineError({ message: 'boom' }).code).toBe('unknown')
  })

  it('메시지에는 항상 다음 행동이 있다 (막다른 에러 금지 — L-06)', () => {
    for (const code of [
      'validation/position-dup',
      'validation/time-reversed',
      'validation/cost-negative',
      'not-found',
      'unknown',
    ] as const) {
      expect(timelineErrorMessage(code)).toMatch(/주세요|보세요/)
    }
  })
})

describe('isTimeReversed — 야간 이동 판정 (PRD 엣지)', () => {
  it('도착이 출발보다 이르면 역전이다', () => {
    expect(isTimeReversed('23:00', '01:10')).toBe(true)
  })

  it('같거나 늦으면 역전이 아니다', () => {
    expect(isTimeReversed('09:00', '11:30')).toBe(false)
    expect(isTimeReversed('09:00', '09:00')).toBe(false)
  })
})

describe('saveLeg — 확인 없는 역전 저장은 막는다 (E-08 validation/time-reversed)', () => {
  it('offset 0 인 채로 도착<출발이면 네트워크를 타기 전에 거절한다', async () => {
    const failure = await saveLeg(forbiddenClient, {
      id: 'leg-1',
      day_id: 'day-1',
      position: 0,
      ...draft({ depart_at: '23:00', arrive_at: '01:10' }),
    }).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(TimelineError)
    expect((failure as TimelineError).code).toBe('validation/time-reversed')
    expect(forbiddenClient.from).not.toHaveBeenCalled()
  })

  it('음수 가격도 네트워크 앞에서 거절한다', async () => {
    const failure = await saveLeg(forbiddenClient, {
      id: 'leg-1',
      day_id: 'day-1',
      position: 0,
      ...draft({ cost_amount: -100 }),
    }).catch((error: unknown) => error)

    expect((failure as TimelineError).code).toBe('validation/cost-negative')
  })
})

describe('이동 수단 어휘 (E-08 mode)', () => {
  it('스키마 CHECK 와 같은 7종을 같은 순서로 노출한다', () => {
    expect(LEG_MODE_ORDER).toEqual(['train', 'bus', 'flight', 'ship', 'car', 'walk', 'other'])
    expect(LEG_MODE_ORDER.map((mode) => LEG_MODE_LABEL[mode])).toEqual([
      '기차',
      '버스',
      '항공',
      '배',
      '차',
      '도보',
      '기타',
    ])
  })
})

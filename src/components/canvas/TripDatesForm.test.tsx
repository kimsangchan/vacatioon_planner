/** @vitest-environment jsdom */
// T7-3 (docs/design/06 변환표 FR-015) — 기간 고치기.
// 데이터는 E-14 가 지킨다(단일 트랜잭션·보관함 복귀). 이 폼의 일은 놀라지 않게 하는 것 —
// 담긴 곳이 있는 Day 를 줄일 때만 한 번 묻고, 나머지는 곧장 저장한다.
//
// 날짜 선택은 DateRangeCalendar 가 맡는다(그 규칙은 그쪽 테스트에서 지킨다). 여기서는
// "고른 범위가 저장으로 이어지는가"만 본다. today 는 주입한다 — 실제 오늘에 기대면 내일 깨진다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TripError } from '@/lib/trips/api'
import type { DayRow, StopRow } from '@/lib/trips/bundle'
import { TripDatesForm } from './TripDatesForm'

afterEach(cleanup)

const stop = (id: string): StopRow => ({
  id,
  day_id: 'd3',
  place_id: `p-${id}`,
  position: 0,
  start_time: null,
  cost_amount: null,
  confirmed: true,
  note: '',
})

const DAYS: DayRow[] = [
  { id: 'd1', trip_id: 't1', date: '2026-08-11', position: 0, color: null, stops: [], legs: [] },
  { id: 'd2', trip_id: 't1', date: '2026-08-12', position: 1, color: null, stops: [], legs: [] },
  { id: 'd3', trip_id: 't1', date: '2026-08-13', position: 2, color: null, stops: [stop('s1'), stop('s2')], legs: [] },
]

function renderForm(props: Partial<Parameters<typeof TripDatesForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  render(
    <TripDatesForm
      startDate="2026-08-11"
      endDate="2026-08-13"
      days={DAYS}
      today="2026-08-11"
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  )
  return { onSubmit, onCancel }
}

const pickDay = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))
const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '기간 저장하기' }))
  })
}

describe('TripDatesForm — 기간 고치기 (FR-015)', () => {
  it('지금 기간을 고른 상태로 보여준다', () => {
    renderForm()
    expect(screen.getByText(/2026\.08\.11 ~ 2026\.08\.13/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '2026년 8월 11일' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('담긴 게 없는 Day 만 줄어들면 묻지 않고 바로 저장한다', async () => {
    const { onSubmit } = renderForm({ days: [DAYS[0], DAYS[1]], endDate: '2026-08-12' })

    pickDay('2026년 8월 11일') // 하루짜리로 줄인다
    await save()

    expect(onSubmit).toHaveBeenCalledWith('2026-08-11', '2026-08-11')
  })

  it('늘리기는 확인 없이 저장한다', async () => {
    const { onSubmit } = renderForm()

    pickDay('2026년 8월 11일')
    pickDay('2026년 8월 15일')
    await save()

    expect(onSubmit).toHaveBeenCalledWith('2026-08-11', '2026-08-15')
  })
})

describe('TripDatesForm — 줄이기 확인 (PRD 엣지: 데이터 손실 금지·놀람 방지)', () => {
  it('담긴 곳이 있는 Day 가 사라지면 실행 전에 묻는다', async () => {
    const { onSubmit } = renderForm()

    pickDay('2026년 8월 11일')
    pickDay('2026년 8월 12일')
    await save()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain(
      '8/13 하루를 줄이면 담긴 2곳이 보관함으로 돌아가요 — 계속할까요?',
    )
  })

  it('계속하겠다고 하면 그때 저장한다', async () => {
    const { onSubmit } = renderForm()

    pickDay('2026년 8월 11일')
    pickDay('2026년 8월 12일')
    await save()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '네, 줄일게요' }))
    })

    expect(onSubmit).toHaveBeenCalledWith('2026-08-11', '2026-08-12')
  })

  it('그만두면 저장하지 않고 날짜를 다시 고르게 둔다', async () => {
    const { onSubmit } = renderForm()

    pickDay('2026년 8월 11일')
    pickDay('2026년 8월 12일')
    await save()
    fireEvent.click(screen.getByRole('button', { name: '아니요, 날짜를 고칠게요' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('TripDatesForm — 막다른 에러 금지 (E-14 validation/date-range)', () => {
  // 달력은 거꾸로 된 기간을 애초에 못 만들지만, 계약 에러가 오면 다음 행동을 줘야 한다
  it('E-14 가 기간을 거절하면 다음 행동이 있는 문구로 알린다', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new TripError('validation/date-range'))
    renderForm({ onSubmit })

    await save()

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('끝나는 날')
    expect(alert.textContent).toContain('다시 골라')
  })
})

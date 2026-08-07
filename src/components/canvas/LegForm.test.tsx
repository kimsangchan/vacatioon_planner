/** @vitest-environment jsdom */
// T7-2 (docs/design/06 변환표 FR-008·FR-008 엣지) — 이동 입력 폼.
// 핵심은 "도착<출발이면 익일 도착인지 물어 확정한다"는 PRD 엣지다. 확인 전에는 저장하지 않는다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LegRow } from '@/lib/trips/bundle'
import { LegForm } from './LegForm'

afterEach(cleanup)

function renderForm(props: Partial<Parameters<typeof LegForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const onCancel = vi.fn()
  render(<LegForm onSubmit={onSubmit} onCancel={onCancel} {...props} />)
  return { onSubmit, onCancel }
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function submit(name = '이동 담기') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

describe('LegForm — 이동 입력 (FR-008)', () => {
  it('유형·시각·지점·예약번호·가격·메모를 그대로 넘긴다', async () => {
    const { onSubmit } = renderForm()

    fireEvent.change(screen.getByLabelText('이동 수단'), { target: { value: 'train' } })
    fill('출발 시각', '09:00')
    fill('도착 시각', '11:30')
    fill('출발 지점', '용산역')
    fill('도착 지점', '목포역')
    fill('예약번호', 'KTX-1234')
    fill('가격', '59800')
    fill('메모', '4호차 3A')
    await submit()

    expect(onSubmit).toHaveBeenCalledWith({
      mode: 'train',
      depart_at: '09:00',
      arrive_at: '11:30',
      arrive_day_offset: 0,
      from_label: '용산역',
      to_label: '목포역',
      booking_ref: 'KTX-1234',
      cost_amount: 59800,
      memo: '4호차 3A',
    })
  })

  it('가격은 숫자 키패드로 받고 천 단위 콤마로 보여 준다 (SPEC §UI 규칙)', () => {
    renderForm()

    const price = screen.getByLabelText('가격') as HTMLInputElement
    expect(price.inputMode).toBe('numeric')

    fireEvent.change(price, { target: { value: '59800' } })
    expect(price.value).toBe('59,800')
  })

  it('가격을 비워 두면 미입력으로 넘긴다 — 0원과 구분한다', async () => {
    const { onSubmit } = renderForm()

    fill('출발 시각', '09:00')
    fill('도착 시각', '11:30')
    await submit()

    expect(onSubmit.mock.calls[0][0].cost_amount).toBeNull()
  })
})

describe('LegForm — 도착<출발 확인 플로우 (PRD 엣지 / validation/time-reversed)', () => {
  it('확인 전에는 저장하지 않고 다음 날 도착인지 묻는다', async () => {
    const { onSubmit } = renderForm()

    fill('출발 시각', '23:00')
    fill('도착 시각', '01:10')
    await submit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('다음 날 도착인가요?')
  })

  it('다음 날 도착이라고 답하면 arrive_day_offset=1 로 저장한다', async () => {
    const { onSubmit } = renderForm()

    fill('출발 시각', '23:00')
    fill('도착 시각', '01:10')
    await submit()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '네, 다음 날 도착이에요' }))
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      depart_at: '23:00',
      arrive_at: '01:10',
      arrive_day_offset: 1,
    })
  })

  it('아니라고 답하면 저장하지 않고 시각을 고칠 수 있게 둔다', async () => {
    const { onSubmit } = renderForm()

    fill('출발 시각', '23:00')
    fill('도착 시각', '01:10')
    await submit()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '아니요, 시각을 고칠게요' }))
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect((screen.getByLabelText('도착 시각') as HTMLInputElement).value).toBe('01:10')
  })

  it('시각을 고쳐 역전이 풀리면 확인 없이 저장된다', async () => {
    const { onSubmit } = renderForm()

    fill('출발 시각', '23:00')
    fill('도착 시각', '01:10')
    await submit()
    fill('도착 시각', '23:40')
    await submit()

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].arrive_day_offset).toBe(0)
  })
})

describe('LegForm — 고치기 (기존 Leg)', () => {
  const leg: LegRow = {
    id: 'l1',
    day_id: 'd1',
    mode: 'bus',
    depart_at: '13:00',
    arrive_at: '15:20',
    arrive_day_offset: 0,
    from_label: '목포터미널',
    to_label: '광주터미널',
    booking_ref: 'B-77',
    cost_amount: 12800,
    memo: '',
    position: 2,
    photos: [],
  }

  it('기존 값을 채워 두고 같은 폼으로 고친다', async () => {
    const { onSubmit } = renderForm({ leg })

    expect((screen.getByLabelText('이동 수단') as HTMLSelectElement).value).toBe('bus')
    expect((screen.getByLabelText('출발 지점') as HTMLInputElement).value).toBe('목포터미널')
    expect((screen.getByLabelText('가격') as HTMLInputElement).value).toBe('12,800')

    fill('도착 지점', '나주역')
    await submit('이동 저장하기')

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ to_label: '나주역' }))
  })
})

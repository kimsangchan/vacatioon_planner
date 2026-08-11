/** @vitest-environment jsdom */
// FR-015 — 기간을 달력에서 고른다. 시작일을 누르고 종료일을 누르면 범위가 잡히고,
// 데스크톱에서는 끌어서도 잡힌다. 지난 날짜는 고를 수 없다(여행은 앞으로의 일이다).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DateRangeCalendar } from './DateRangeCalendar'

afterEach(cleanup)

const TODAY = '2026-08-11'

function renderCalendar(props: Partial<Parameters<typeof DateRangeCalendar>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <DateRangeCalendar
      start={TODAY}
      end={TODAY}
      minDate={TODAY}
      onChange={onChange}
      {...props}
    />,
  )
  return { onChange }
}

const day = (label: string) => screen.getByRole('button', { name: label })

describe('DateRangeCalendar — 범위 고르기 (FR-015)', () => {
  it('그 달을 제목으로 보여준다', () => {
    renderCalendar()
    expect(screen.getByText('2026년 8월')).toBeTruthy()
  })

  it('지난 날짜는 고를 수 없다', () => {
    renderCalendar()
    expect(day('2026년 8월 10일').hasAttribute('disabled')).toBe(true)
    expect(day('2026년 8월 11일').hasAttribute('disabled')).toBe(false)
  })

  it('처음 누른 날은 시작이자 끝이 된다 — 하루짜리', () => {
    const { onChange } = renderCalendar()
    fireEvent.click(day('2026년 8월 14일'))
    expect(onChange).toHaveBeenCalledWith('2026-08-14', '2026-08-14')
  })

  it('그 다음 누른 날까지가 범위다', () => {
    const { onChange } = renderCalendar()
    fireEvent.click(day('2026년 8월 14일'))
    fireEvent.click(day('2026년 8월 17일'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08-14', '2026-08-17')
  })

  it('시작보다 이른 날을 누르면 거기서 다시 시작한다 — 거꾸로 된 기간을 만들지 않는다', () => {
    const { onChange } = renderCalendar()
    fireEvent.click(day('2026년 8월 20일'))
    fireEvent.click(day('2026년 8월 15일'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08-15', '2026-08-15')
  })

  it('범위 안의 날은 눌린 상태로 보인다', () => {
    renderCalendar({ start: '2026-08-12', end: '2026-08-14' })
    expect(day('2026년 8월 12일').getAttribute('aria-pressed')).toBe('true')
    expect(day('2026년 8월 13일').getAttribute('aria-pressed')).toBe('true')
    expect(day('2026년 8월 14일').getAttribute('aria-pressed')).toBe('true')
    expect(day('2026년 8월 15일').getAttribute('aria-pressed')).toBe('false')
  })

  // 실제 포인터는 언제나 mousedown → mouseup → click 순서로 온다. click 만 쏘는 테스트는
  // 이 순서를 건너뛰어 결함을 가린다 — 터치 탭도 호환 마우스 이벤트를 그대로 발사한다.
  const tap = (label: string) => {
    const button = day(label)
    fireEvent.mouseDown(button)
    fireEvent.mouseUp(button)
    fireEvent.click(button)
  }

  it('실제 탭 순서로 두 번 눌러도 범위가 잡힌다 (모바일·데스크톱 공통)', () => {
    const { onChange } = renderCalendar()

    tap('2026년 8월 14일')
    tap('2026년 8월 17일')

    expect(onChange).toHaveBeenLastCalledWith('2026-08-14', '2026-08-17')
  })

  it('실제 탭 순서에서도 시작보다 이른 날은 새 시작이 된다', () => {
    const { onChange } = renderCalendar()

    tap('2026년 8월 20일')
    tap('2026년 8월 15일')

    expect(onChange).toHaveBeenLastCalledWith('2026-08-15', '2026-08-15')
  })

  it('끌어서도 범위를 잡는다 (데스크톱)', () => {
    const { onChange } = renderCalendar()
    fireEvent.mouseDown(day('2026년 8월 13일'))
    fireEvent.mouseEnter(day('2026년 8월 16일'))
    fireEvent.mouseUp(day('2026년 8월 16일'))
    expect(onChange).toHaveBeenLastCalledWith('2026-08-13', '2026-08-16')
  })

  it('다음 달로 넘어간다', () => {
    renderCalendar()
    fireEvent.click(screen.getByRole('button', { name: '다음 달' }))
    expect(screen.getByText('2026년 9월')).toBeTruthy()
  })

  it('고를 수 있는 달보다 앞으로는 못 간다', () => {
    renderCalendar()
    expect(screen.getByRole('button', { name: '지난 달' }).hasAttribute('disabled')).toBe(true)
  })

  it('고른 기간을 세는 말로 알려준다', () => {
    renderCalendar({ start: '2026-08-11', end: '2026-08-13' })
    expect(screen.getByText(/2박 3일/)).toBeTruthy()
  })
})

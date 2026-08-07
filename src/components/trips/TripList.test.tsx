/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TripList } from './TripList'

afterEach(cleanup)

const trip = {
  id: '6f5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b23',
  name: '제주 3일',
  start_date: '2026-08-01',
  end_date: '2026-08-03',
  place_count: 3,
}

describe('TripList — 여행 목록 (FR-014)', () => {
  it('shows the name, the period and the place count, and opens the canvas', () => {
    render(<TripList trips={[trip]} onCreateFirst={vi.fn()} />)

    const link = screen.getByRole('link', { name: /제주 3일/ })
    expect(link.getAttribute('href')).toBe(`/trip/${trip.id}`)
    expect(link.textContent).toContain('2026.08.01 ~ 2026.08.03')
    expect(link.textContent).toContain('장소 3곳')
  })

  it('guides the first trip when nothing is saved yet', () => {
    const onCreateFirst = vi.fn()
    render(<TripList trips={[]} onCreateFirst={onCreateFirst} />)

    const cta = screen.getByRole('button', { name: '첫 여행 만들기' })
    fireEvent.click(cta)

    expect(onCreateFirst).toHaveBeenCalledTimes(1)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('counts places one by one', () => {
    render(<TripList trips={[{ ...trip, place_count: 0 }]} onCreateFirst={vi.fn()} />)

    expect(screen.getByRole('link', { name: /제주 3일/ }).textContent).toContain('장소 0곳')
  })
})

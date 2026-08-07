/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TripError } from '@/lib/trips/api'
import { NewTripForm } from './NewTripForm'

afterEach(cleanup)

function fillForm() {
  fireEvent.change(screen.getByLabelText('여행 이름'), { target: { value: '제주 3일' } })
  fireEvent.change(screen.getByLabelText('시작하는 날'), { target: { value: '2026-08-01' } })
  fireEvent.change(screen.getByLabelText('끝나는 날'), { target: { value: '2026-08-03' } })
}

describe('NewTripForm — 새 여행 (FR-002)', () => {
  it('hands the name and the period to the caller', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<NewTripForm onCreate={onCreate} onCancel={vi.fn()} />)

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: '여행 만들기' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        name: '제주 3일',
        start_date: '2026-08-01',
        end_date: '2026-08-03',
      }),
    )
  })

  it('turns validation/date-range into a sentence with a next action (E-02)', async () => {
    const onCreate = vi.fn().mockRejectedValue(new TripError('validation/date-range'))
    render(<NewTripForm onCreate={onCreate} onCancel={vi.fn()} />)

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: '여행 만들기' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('끝나는 날')

    const retry = screen.getByRole('button', { name: '날짜 다시 고르기' })
    fireEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('explains an unexpected failure too', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('boom'))
    render(<NewTripForm onCreate={onCreate} onCancel={vi.fn()} />)

    fillForm()
    fireEvent.click(screen.getByRole('button', { name: '여행 만들기' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent!.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '날짜 다시 고르기' })).toBeTruthy()
  })
})

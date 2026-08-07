/** @vitest-environment jsdom */
// T7-3 (docs/design/06 변환표 FR-017) — 삭제와 되돌리기는 한 화면에서 끝난다 (T-06).
// 방금 지운 것은 알림 줄의 "되돌리기"로, 새로고침 뒤에는 아래 접힌 섹션으로 — 두 경로 모두 90일 안이면 살아난다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DeletedTrip, TripSummary } from '@/lib/trips/api'
import { TripsPanel } from './TripsPanel'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

afterEach(cleanup)

const TRIPS: TripSummary[] = [
  {
    id: '6f5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b23',
    name: '제주 3일',
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    place_count: 3,
  },
  {
    id: '7a5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b24',
    name: '목포 2일',
    start_date: '2026-09-01',
    end_date: '2026-09-02',
    place_count: 1,
  },
]

const DELETED: DeletedTrip[] = [
  {
    id: '8b5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b25',
    name: '지운 여행',
    start_date: '2026-07-01',
    end_date: '2026-07-02',
    deleted_at: '2026-08-01T00:00:00.000Z',
  },
]

function renderPanel(props: Partial<Parameters<typeof TripsPanel>[0]> = {}) {
  const onDelete = vi.fn().mockResolvedValue(undefined)
  const onRestore = vi.fn().mockResolvedValue(undefined)
  render(
    <TripsPanel
      trips={TRIPS}
      deletedTrips={[]}
      onCreate={vi.fn()}
      onDelete={onDelete}
      onRestore={onRestore}
      {...props}
    />,
  )
  return { onDelete, onRestore }
}

describe('TripsPanel — 여행 지우기 (FR-017 soft delete)', () => {
  it('지우면 목록에서 사라지고 되돌릴 수 있는 알림 줄이 남는다', async () => {
    const { onDelete } = renderPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '제주 3일 삭제하기' }))
    })

    expect(onDelete).toHaveBeenCalledWith(TRIPS[0].id)
    expect(screen.queryByRole('link', { name: /제주 3일/ })).toBeNull()
    expect(screen.getByRole('link', { name: /목포 2일/ })).toBeTruthy()

    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain('제주 3일')
    expect(notice.textContent).toContain('지웠어요')
    expect(within(notice).getByRole('button', { name: '되돌리기' })).toBeTruthy()
  })

  it('되돌리기를 누르면 목록으로 돌아온다 (T-06 — 되돌리기 항상 가능)', async () => {
    const { onRestore } = renderPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '제주 3일 삭제하기' }))
    })
    await act(async () => {
      fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: '되돌리기' }))
    })

    expect(onRestore).toHaveBeenCalledWith(TRIPS[0].id)
    expect(screen.getByRole('link', { name: /제주 3일/ })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('지우기는 강조하지 않는다 — 화면의 강조 CTA 는 하나뿐이다 (L-09)', () => {
    renderPanel()

    const remove = screen.getByRole('button', { name: '제주 3일 삭제하기' })
    expect(remove.className).not.toContain('bg-foreground')
  })
})

describe('TripsPanel — 최근 삭제한 여행 (FR-017 90일 되돌리기)', () => {
  it('지운 여행이 없으면 섹션을 두지 않는다', () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: /최근 삭제한 여행/ })).toBeNull()
  })

  it('접힌 채로 개수만 알리고, 펼치면 되돌리기를 준다', async () => {
    const { onRestore } = renderPanel({ deletedTrips: DELETED })

    const toggle = screen.getByRole('button', { name: /최근 삭제한 여행 1개/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('지운 여행')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('지운 여행')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '지운 여행 되돌리기' }))
    })
    expect(onRestore).toHaveBeenCalledWith(DELETED[0].id)
  })
})

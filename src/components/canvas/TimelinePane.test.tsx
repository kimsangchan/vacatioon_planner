/** @vitest-environment jsdom */
// T7-2 (docs/design/06 변환표 FR-008·FR-008 병합) — Day 타임라인.
// 순서의 진실은 통합 position 하나뿐이고(결정 #15), 시각은 라벨이다. 지출 합계는 Stop+Leg 합(결정 #24).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { DayRow, LegRow, PhotoRow, PlaceRow, StopRow } from '@/lib/trips/bundle'
import { TimelinePane } from './TimelinePane'

afterEach(cleanup)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'

function photo(id: string): PhotoRow {
  return {
    id,
    storage_path: `photos/${id}/${id}.webp`,
    thumb_path: `photos/${id}/${id}-thumb.webp`,
    is_cover: true,
  }
}

const TICKET = photo('33333333-3333-4333-8333-333333333333')

const place = (id: string, name: string): PlaceRow => ({
  id,
  trip_id: 'trip-1',
  category: 'restaurant',
  name,
  address: '제주특별자치도',
  road_address: '제주특별자치도',
  lat: 33.5,
  lng: 126.5,
  provider: 'naver',
  provider_link: null,
  memo: '',
  photos: [],
})

const PLACES = [place('p1', '흑돼지집'), place('p2', '호텔제주')]

const stop = (o: Partial<StopRow> & { id: string; place_id: string; position: number }): StopRow => ({
  day_id: 'd1',
  start_time: null,
  cost_amount: null,
  note: '',
  ...o,
})

const leg = (o: Partial<LegRow> & { id: string; position: number }): LegRow => ({
  day_id: 'd1',
  mode: 'bus',
  depart_at: '14:00',
  arrive_at: '15:30',
  arrive_day_offset: 0,
  from_label: '제주공항',
  to_label: '서귀포',
  booking_ref: '',
  cost_amount: null,
  memo: '',
  photos: [],
  ...o,
})

function day(o: Partial<DayRow> = {}): DayRow {
  return {
    id: 'd1',
    trip_id: 'trip-1',
    date: '2026-08-01',
    position: 0,
    stops: [
      stop({ id: 's1', place_id: 'p1', position: 0, start_time: '09:30', cost_amount: 12000 }),
      stop({ id: 's2', place_id: 'p2', position: 2, start_time: '11:00' }),
    ],
    legs: [leg({ id: 'l1', position: 1, cost_amount: 35800 })],
    ...o,
  }
}

function renderPane(props: Partial<Parameters<typeof TimelinePane>[0]> = {}) {
  const handlers = {
    onReorder: vi.fn().mockResolvedValue(undefined),
    onUnassignStop: vi.fn().mockResolvedValue(undefined),
    onUpdateStop: vi.fn().mockResolvedValue(undefined),
    onSaveLeg: vi.fn().mockResolvedValue(undefined),
    onAddLegPhoto: vi.fn().mockResolvedValue(undefined),
    onRemovePhoto: vi.fn().mockResolvedValue(undefined),
    onRemoveLeg: vi.fn().mockResolvedValue(undefined),
  }
  render(<TimelinePane day={day()} label="1일차" places={PLACES} {...handlers} {...props} />)
  return handlers
}

const row = (id: string) => screen.getByTestId(`day-item-${id}`)

describe('TimelinePane — 통합 position 병합 (결정 #15)', () => {
  it('Stop 과 Leg 를 position 순서 하나로만 늘어놓는다', () => {
    renderPane()

    const ids = screen
      .getAllByTestId(/^day-item-/)
      .map((node) => node.dataset.testid ?? node.getAttribute('data-testid'))

    expect(ids).toEqual(['day-item-s1', 'day-item-l1', 'day-item-s2'])
  })

  it('Leg 는 출발→도착 시각과 지점을 한 줄에 담는다 (SC-004)', () => {
    renderPane()

    const text = row('l1').textContent ?? ''
    expect(text).toContain('14:00')
    expect(text).toContain('15:30')
    expect(text).toContain('제주공항')
    expect(text).toContain('서귀포')
  })

  it('익일 도착 Leg 는 +1일을 붙여 알려 준다', () => {
    renderPane({
      day: day({
        stops: [],
        legs: [
          leg({ id: 'l1', position: 0, depart_at: '23:00', arrive_at: '01:10', arrive_day_offset: 1 }),
        ],
      }),
    })

    expect(row('l1').textContent).toContain('+1일')
  })

  it('position 과 시각이 역전된 항목에만 경고 배지를 붙인다', () => {
    renderPane()

    expect(row('s2').dataset.timeWarning).toBe('true')
    expect(within(row('s2')).getByText('시각 순서 확인')).toBeTruthy()
    expect(row('s1').dataset.timeWarning).toBe('false')
    expect(row('l1').dataset.timeWarning).toBe('false')
  })
})

describe('TimelinePane — Day 지출 합계 (FR-008 / 결정 #24)', () => {
  it('Stop 과 Leg 가격을 합쳐 타임라인 아래에 보여 준다', () => {
    renderPane()

    expect(screen.getByTestId('day-total').textContent).toContain('오늘 47,800원')
  })

  it('가격을 적은 항목이 없으면 합계 줄을 두지 않는다', () => {
    renderPane({
      day: day({
        stops: [stop({ id: 's1', place_id: 'p1', position: 0 })],
        legs: [],
      }),
    })

    expect(screen.queryByTestId('day-total')).toBeNull()
  })
})

describe('TimelinePane — 순서 변경 (E-07 reorder_day_items)', () => {
  it('위로 올리면 통합 순서 배열을 그대로 넘긴다', async () => {
    const { onReorder } = renderPane()

    await act(async () => {
      fireEvent.click(within(row('s2')).getByRole('button', { name: '위로 옮기기' }))
    })

    expect(onReorder).toHaveBeenCalledWith('d1', ['s1', 's2', 'l1'])
  })

  it('아래로 내릴 때도 Stop·Leg 를 한 배열로 다룬다', async () => {
    const { onReorder } = renderPane()

    await act(async () => {
      fireEvent.click(within(row('s1')).getByRole('button', { name: '아래로 옮기기' }))
    })

    expect(onReorder).toHaveBeenCalledWith('d1', ['l1', 's1', 's2'])
  })

  it('맨 위 항목에는 위로 옮기기를 두지 않는다', () => {
    renderPane()

    expect(within(row('s1')).queryByRole('button', { name: '위로 옮기기' })).toBeNull()
    expect(within(row('s2')).queryByRole('button', { name: '아래로 옮기기' })).toBeNull()
  })
})

describe('TimelinePane — Stop 배치 해제·시각·가격 (FR-007)', () => {
  it('보관함으로 되돌리면 그 Stop 만 지운다', async () => {
    const { onUnassignStop } = renderPane()

    await act(async () => {
      fireEvent.click(within(row('s1')).getByRole('button', { name: '보관함으로 되돌리기' }))
    })

    expect(onUnassignStop).toHaveBeenCalledWith('s1')
  })

  it('시각과 가격을 적어 저장한다 (원 단위 정수)', async () => {
    const { onUpdateStop } = renderPane()

    fireEvent.click(within(row('s2')).getByRole('button', { name: '시각·가격 적기' }))
    fireEvent.change(screen.getByLabelText('방문 시각'), { target: { value: '13:20' } })

    const price = screen.getByLabelText('가격') as HTMLInputElement
    expect(price.inputMode).toBe('numeric')
    fireEvent.change(price, { target: { value: '8000' } })
    expect(price.value).toBe('8,000')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시각·가격 저장하기' }))
    })

    expect(onUpdateStop).toHaveBeenCalledWith('s2', { start_time: '13:20', cost_amount: 8000 })
  })

  it('시각을 지우면 없는 값(null)으로 저장한다 — 시각은 선택 입력이다', async () => {
    const { onUpdateStop } = renderPane()

    fireEvent.click(within(row('s1')).getByRole('button', { name: '시각·가격 적기' }))
    fireEvent.change(screen.getByLabelText('방문 시각'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('가격'), { target: { value: '' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시각·가격 저장하기' }))
    })

    expect(onUpdateStop).toHaveBeenCalledWith('s1', { start_time: null, cost_amount: null })
  })

  it('Stop 은 이름과 시각·가격을 한 줄에 둔다 (SC-004 — 높이 절제)', () => {
    renderPane()

    const text = row('s1').textContent ?? ''
    expect(text).toContain('흑돼지집')
    expect(text).toContain('09:30')
    expect(text).toContain('12,000원')
  })
})

describe('TimelinePane — 이동 담기 (FR-008)', () => {
  it('이동을 담으면 그 Day 로 넘긴다', async () => {
    const { onSaveLeg } = renderPane()

    fireEvent.click(screen.getByRole('button', { name: '이동 적기' }))
    fireEvent.change(screen.getByLabelText('출발 시각'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('도착 시각'), { target: { value: '19:10' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이동 담기' }))
    })

    expect(onSaveLeg).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ depart_at: '18:00', arrive_at: '19:10', arrive_day_offset: 0 }),
      undefined,
    )
  })

  it('담아 둔 이동은 같은 폼으로 고친다', async () => {
    const { onSaveLeg } = renderPane()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.change(screen.getByLabelText('도착 지점'), { target: { value: '중문' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이동 저장하기' }))
    })

    expect(onSaveLeg).toHaveBeenCalledWith(
      'd1',
      expect.objectContaining({ to_label: '중문' }),
      'l1',
    )
  })

  // 06 부록 체크리스트 5 (L-09) — 편집 폼의 강조가 미리보기 시트의 강조와 겹치지 않게,
  // 펼치는 순간을 위(CanvasBoard)로 알린다
  it('이동 폼을 펼칠 때마다 알려 준다 (담기·고치기 모두)', () => {
    const onEditorOpen = vi.fn()
    renderPane({ onEditorOpen })

    fireEvent.click(screen.getByRole('button', { name: '이동 적기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(2)

    // 접을 때는 알리지 않는다 — 닫힌 폼 때문에 시트가 사라지면 이상하다
    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(2)
  })

  it('Stop 시각·가격 편집기를 펼칠 때도 알려 준다 — 강조는 하나다', () => {
    const onEditorOpen = vi.fn()
    renderPane({ onEditorOpen })

    fireEvent.click(within(row('s1')).getByRole('button', { name: '시각·가격 적기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(1)

    fireEvent.click(within(row('s1')).getByRole('button', { name: '시각·가격 적기' }))
    expect(onEditorOpen).toHaveBeenCalledTimes(1)
  })
})

describe('TimelinePane — Leg 예매 캡처 (FR-018 / E-05 leg_id 첨부)', () => {
  const withTicket = () => day({ legs: [leg({ id: 'l1', position: 1, photos: [TICKET] })] })

  it('담아 둔 캡처를 썸네일로 두고, 누르면 원본을 연다', () => {
    renderPane({ day: withTicket() })

    const link = within(row('l1')).getByRole('link', { name: '예매 캡처 크게 보기' })
    expect(link.getAttribute('href')).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/${TICKET.storage_path}`,
    )
    expect(link.getAttribute('target')).toBe('_blank')

    const image = within(row('l1')).getByRole('img', { name: '예매 캡처' }) as HTMLImageElement
    expect(image.src).toBe(`${SUPABASE_URL}/storage/v1/object/public/${TICKET.thumb_path}`)
  })

  it('이동 고치기에서 고른 파일을 그 Leg 로 넘긴다', async () => {
    const { onAddLegPhoto } = renderPane()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    const file = new File([new Uint8Array(8)], 'ktx.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('예매 캡처 담기'), { target: { files: [file] } })
    })

    expect(onAddLegPhoto).toHaveBeenCalledWith('l1', file)
  })

  it('캡처 지우기는 되돌릴 수 없어 한 번 묻는다 (E-12 hard delete)', async () => {
    const { onRemovePhoto } = renderPane({ day: withTicket() })

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.click(within(row('l1')).getByRole('button', { name: '예매 캡처 지우기' }))

    expect(onRemovePhoto).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('되돌릴 수 없어요')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '캡처 지우기' }))
    })
    expect(onRemovePhoto).toHaveBeenCalledWith(TICKET)
  })
})

describe('TimelinePane — 이동 지우기 (E-12 hard delete)', () => {
  it('확인한 뒤에만 지운다', async () => {
    const { onRemoveLeg } = renderPane()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 지우기' }))

    expect(onRemoveLeg).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('되돌릴 수 없어요')

    await act(async () => {
      fireEvent.click(within(alert).getByRole('button', { name: '지우기' }))
    })
    expect(onRemoveLeg).toHaveBeenCalledWith('l1')
  })

  it('그만두면 이동은 그대로 남는다 (T-06)', () => {
    const { onRemoveLeg } = renderPane()

    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 고치기' }))
    fireEvent.click(within(row('l1')).getByRole('button', { name: '이동 지우기' }))
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '그만두기' }))

    expect(onRemoveLeg).not.toHaveBeenCalled()
    expect(row('l1')).toBeTruthy()
  })
})

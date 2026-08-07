/** @vitest-environment jsdom */
// T6-4b — 미리보기 (FR-006). 데스크톱 호버는 카드, 모바일 탭은 바텀시트 —
// 같은 컴포넌트의 두 얼굴이다. 사진이 없어도 기능은 성립해야 한다 (PRD 엣지케이스).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PhotoError } from '@/lib/photo/upload'
import type { PhotoRow, PlaceRow } from '@/lib/trips/bundle'
import { PreviewCard } from './PreviewCard'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'

function photo(id: string, isCover: boolean): PhotoRow {
  return {
    id,
    storage_path: `photos/${id}/${id}.webp`,
    thumb_path: `photos/${id}/${id}-thumb.webp`,
    is_cover: isCover,
  }
}

function place(overrides: Partial<PlaceRow> = {}): PlaceRow {
  return {
    id: 'p1',
    trip_id: 'trip-1',
    category: 'restaurant',
    name: '흑돼지집',
    address: '제주특별자치도 제주시 연동 1',
    road_address: '제주특별자치도 제주시 노형로 1',
    lat: 33.4996,
    lng: 126.5312,
    provider: 'naver',
    provider_link: 'https://map.naver.com/p/1',
    memo: '',
    photos: [],
    ...overrides,
  }
}

afterEach(cleanup)

describe('PreviewCard — 데스크톱 호버 카드 (FR-006)', () => {
  it('대표 사진 썸네일·이름·카테고리·메모 첫 줄을 보여준다', () => {
    render(
      <PreviewCard
        variant="card"
        place={place({
          memo: '흑돼지 두 근\n예약 필요',
          photos: [photo('11111111-1111-4111-8111-111111111111', false), photo('22222222-2222-4222-8222-222222222222', true)],
        })}
      />,
    )

    const card = screen.getByTestId('preview-card')
    expect(card.dataset.variant).toBe('card')

    const image = screen.getByRole('img', { name: /흑돼지집/ }) as HTMLImageElement
    expect(image.src).toBe(
      `${SUPABASE_URL}/storage/v1/object/public/photos/22222222-2222-4222-8222-222222222222/22222222-2222-4222-8222-222222222222-thumb.webp`,
    )

    expect(card.textContent).toContain('흑돼지집')
    expect(card.textContent).toContain('식당')
    expect(card.textContent).toContain('흑돼지 두 근')
    expect(card.textContent).not.toContain('예약 필요')
  })

  it('모션은 fade 120ms 하나뿐이다 (SPEC §UI 규칙)', () => {
    render(<PreviewCard variant="card" place={place()} />)

    expect(screen.getByTestId('preview-card').className).toContain('fade-in_120ms')
  })

  it('사진이 없으면 카테고리 자리표시와 "사진 담기"를 준다 (PRD 엣지)', () => {
    render(<PreviewCard variant="card" place={place({ photos: [] })} onAddPhoto={vi.fn()} />)

    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByTestId('photo-placeholder')).toBeTruthy()
    expect(screen.getByLabelText('사진 담기')).toBeTruthy()
  })
})

describe('PreviewCard — 모바일 바텀시트 (FR-006 / 뎁스 2)', () => {
  it('사진·이름·카테고리·메모·행동 버튼을 한 자리에 모은다', () => {
    render(
      <PreviewCard
        variant="sheet"
        place={place({ memo: '흑돼지 두 근' })}
        onAddPhoto={vi.fn()}
        onSaveMemo={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const sheet = screen.getByTestId('preview-card')
    expect(sheet.dataset.variant).toBe('sheet')
    expect(sheet.textContent).toContain('흑돼지집')
    expect(sheet.textContent).toContain('식당')
    expect((screen.getByLabelText('메모') as HTMLTextAreaElement).value).toBe('흑돼지 두 근')
    expect(screen.getByRole('button', { name: '메모 저장하기' })).toBeTruthy()
    expect(screen.getByLabelText('사진 담기')).toBeTruthy()
  })

  it('메모를 고쳐 저장하면 그대로 넘긴다 (E-09 / FR-009)', async () => {
    const onSaveMemo = vi.fn().mockResolvedValue(undefined)
    render(<PreviewCard variant="sheet" place={place()} onSaveMemo={onSaveMemo} />)

    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '9시 전에 가기' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '메모 저장하기' }))
    })

    expect(onSaveMemo).toHaveBeenCalledWith('9시 전에 가기')
    expect(screen.getByRole('status').textContent).toContain('메모를 저장했어요')
  })

  it('제공자 링크가 있을 때만 새 탭으로 여는 "네이버에서 보기"를 준다 (FR-009)', () => {
    const { unmount } = render(<PreviewCard variant="sheet" place={place()} />)

    const link = screen.getByRole('link', { name: '네이버에서 보기' }) as HTMLAnchorElement
    expect(link.href).toBe('https://map.naver.com/p/1')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noreferrer')

    unmount()
    render(<PreviewCard variant="sheet" place={place({ provider: 'manual', provider_link: null })} />)
    expect(screen.queryByRole('link', { name: '네이버에서 보기' })).toBeNull()
  })

  it('사진이 여러 장이면 대표를 바꿀 수 있다 (FR-004)', async () => {
    const onSetCover = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        variant="sheet"
        place={place({
          photos: [photo('11111111-1111-4111-8111-111111111111', true), photo('22222222-2222-4222-8222-222222222222', false)],
        })}
        onSetCover={onSetCover}
      />,
    )

    const buttons = screen.getAllByRole('button', { name: '대표로 두기' })
    expect(buttons).toHaveLength(1) // 이미 대표인 사진에는 없다

    await act(async () => {
      fireEvent.click(buttons[0])
    })
    expect(onSetCover).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
  })
})

describe('PreviewCard — 사진 담기 (FR-004 / E-05)', () => {
  it('고른 파일을 그대로 넘긴다', async () => {
    const onAddPhoto = vi.fn().mockResolvedValue(undefined)
    render(<PreviewCard variant="sheet" place={place()} onAddPhoto={onAddPhoto} />)

    const file = new File([new Uint8Array(8)], 'jeju.jpg', { type: 'image/jpeg' })
    const input = screen.getByLabelText('사진 담기') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    expect(onAddPhoto).toHaveBeenCalledWith(file)
  })

  it('너무 큰 사진은 다음 행동이 있는 문구로 알린다 (E-05)', async () => {
    const onAddPhoto = vi.fn().mockRejectedValue(new PhotoError('storage/too-large'))
    render(<PreviewCard variant="sheet" place={place()} onAddPhoto={onAddPhoto} />)

    const file = new File([new Uint8Array(8)], 'huge.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('사진 담기'), { target: { files: [file] } })
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('사진이 너무 커요')
    expect(alert.textContent).toContain('다시 골라')
  })
})

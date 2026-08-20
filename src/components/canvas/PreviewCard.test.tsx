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
    estimated_cost: null,
    photos: [],
    ...overrides,
  }
}

afterEach(cleanup)

describe('PreviewCard — 카드에서 일정에 넣고 뺀다 (결정 #43)', () => {
  const DAYS = [
    { id: 'd1', label: '1일차' },
    { id: 'd2', label: '2일차' },
  ]

  it('아직 안 넣은 곳은 일차를 골라 넣는다', async () => {
    const onAssign = vi.fn().mockResolvedValue(undefined)
    render(<PreviewCard place={place()} variant="sheet" days={DAYS} onAssign={onAssign} />)

    fireEvent.click(screen.getByRole('button', { name: '일정에 넣기' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '2일차에 넣기' }))
    })

    expect(onAssign).toHaveBeenCalledWith('d2')
  })

  it('이미 넣은 곳은 빼는 문을 낸다', async () => {
    const onUnassign = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        placedCount={1}
        days={DAYS}
        onUnassign={onUnassign}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '일정에서 빼기' }))
    })

    expect(onUnassign).toHaveBeenCalled()
  })

  it('일차가 하나도 없으면 넣는 문을 내지 않는다 — 누를 곳이 없다', () => {
    render(<PreviewCard place={place()} variant="sheet" days={[]} onAssign={vi.fn()} />)

    expect(screen.queryByRole('button', { name: '일정에 넣기' })).toBeNull()
  })

  it('호버 카드에는 넣고 빼는 문이 없다 — 편집은 시트에서만 (FR-006)', () => {
    render(<PreviewCard place={place()} variant="card" days={DAYS} onAssign={vi.fn()} />)

    expect(screen.queryByRole('button', { name: '일정에 넣기' })).toBeNull()
  })
})

describe('PreviewCard — 예상 금액 (결정 #39)', () => {
  it('시트에서 예상 금액을 적어 원 단위 정수로 저장한다', async () => {
    const onSaveEstimatedCost = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        onSaveMemo={vi.fn()}
        onSaveEstimatedCost={onSaveEstimatedCost}
      />,
    )

    fireEvent.change(screen.getByLabelText('예상 금액'), { target: { value: '20000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSaveEstimatedCost).toHaveBeenCalledWith(20000)
  })

  it('치는 동안 천 단위가 보인다 — 0이 몇 개인지 눈으로 세지 않게', () => {
    render(<PreviewCard place={place()} variant="sheet" onSaveEstimatedCost={vi.fn()} />)

    const input = screen.getByLabelText('예상 금액') as HTMLInputElement
    fireEvent.change(input, { target: { value: '20000' } })

    expect(input.value).toBe('20,000')
  })

  it('비우면 null 로 되돌린다 — 0원과 다른 값이다', async () => {
    const onSaveEstimatedCost = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        place={place({ estimated_cost: 20000 })}
        variant="sheet"
        onSaveEstimatedCost={onSaveEstimatedCost}
      />,
    )

    fireEvent.change(screen.getByLabelText('예상 금액'), { target: { value: '' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSaveEstimatedCost).toHaveBeenCalledWith(null)
  })

  it('안 바꾼 값은 저장하지 않는다 — 누를 때마다 같은 값을 다시 쓰지 않는다', async () => {
    const onSaveMemo = vi.fn().mockResolvedValue(undefined)
    const onSaveEstimatedCost = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        place={place({ estimated_cost: 20000 })}
        variant="sheet"
        onSaveMemo={onSaveMemo}
        onSaveEstimatedCost={onSaveEstimatedCost}
      />,
    )

    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '9시 전에' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSaveMemo).toHaveBeenCalledWith('9시 전에')
    expect(onSaveEstimatedCost).not.toHaveBeenCalled()
  })

  it('호버 카드에는 입력이 없다 — 편집은 시트에서만 (FR-006)', () => {
    render(<PreviewCard place={place()} variant="card" onSaveEstimatedCost={vi.fn()} />)

    expect(screen.queryByLabelText('예상 금액')).toBeNull()
  })
})


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
    expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()
    expect(screen.getByLabelText('사진 담기')).toBeTruthy()
  })

  it('메모를 고쳐 저장하면 그대로 넘긴다 (E-09 / FR-009)', async () => {
    const onSaveMemo = vi.fn().mockResolvedValue(undefined)
    render(<PreviewCard variant="sheet" place={place()} onSaveMemo={onSaveMemo} />)

    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '9시 전에 가기' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSaveMemo).toHaveBeenCalledWith('9시 전에 가기')
    expect(screen.getByRole('status').textContent).toContain('저장했어요')
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

describe('PreviewCard — 사진 지우기 (FR-017 / E-12 hard delete)', () => {
  const only = photo('11111111-1111-4111-8111-111111111111', true)

  it('되돌릴 수 없으니 한 번 묻고 지운다', async () => {
    const onRemovePhoto = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard variant="sheet" place={place({ photos: [only] })} onRemovePhoto={onRemovePhoto} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '사진 지우기' }))
    expect(onRemovePhoto).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('되돌릴 수 없어요')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    })
    expect(onRemovePhoto).toHaveBeenCalledWith(only)
  })

  it('그만두면 사진은 그대로다', () => {
    const onRemovePhoto = vi.fn()
    render(
      <PreviewCard variant="sheet" place={place({ photos: [only] })} onRemovePhoto={onRemovePhoto} />,
    )

    fireEvent.click(screen.getByRole('button', { name: '사진 지우기' }))
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))

    expect(onRemovePhoto).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '사진 지우기' })).toBeTruthy()
  })
})

describe('PreviewCard — 보관함에서 빼기 (FR-017 soft delete)', () => {
  it('일정에 담긴 적 없으면 곧장 뺀다 — 되돌릴 수 있으니 묻지 않는다 (T-06)', async () => {
    const onDeletePlace = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        variant="sheet"
        place={place()}
        placedCount={0}
        onDeletePlace={onDeletePlace}
      />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '보관함에서 빼기' }))
    })

    expect(onDeletePlace).toHaveBeenCalledTimes(1)
  })

  it('일정에 담겨 있으면 그 자리도 빠진다고 먼저 알린다 (Stop 은 hard delete — E-12)', async () => {
    const onDeletePlace = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        variant="sheet"
        place={place()}
        placedCount={2}
        onDeletePlace={onDeletePlace}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '보관함에서 빼기' }))

    expect(onDeletePlace).not.toHaveBeenCalled()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('일정에서도 빠져요')
    expect(alert.textContent).toContain('2곳')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '네, 뺄게요' }))
    })
    expect(onDeletePlace).toHaveBeenCalledTimes(1)
  })

  it('빼기는 강조하지 않는다 — 파괴적 행동에 빨간 강조를 남발하지 않는다', () => {
    render(<PreviewCard variant="sheet" place={place()} onDeletePlace={vi.fn()} />)

    const button = screen.getByRole('button', { name: '보관함에서 빼기' })
    expect(button.className).not.toContain('bg-brand')
    expect(button.className).not.toMatch(/text-red|bg-red/)
  })
})

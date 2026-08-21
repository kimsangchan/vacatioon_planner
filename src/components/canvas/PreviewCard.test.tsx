/** @vitest-environment jsdom */
// T6-4b — 미리보기 (FR-006). 데스크톱 호버는 카드, 모바일 탭은 바텀시트 —
// 같은 컴포넌트의 두 얼굴이다. 사진이 없어도 기능은 성립해야 한다 (PRD 엣지케이스).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PhotoError } from '@/lib/photo/upload'
import type { PhotoRow, PlaceRow } from '@/lib/trips/bundle'
import { STAR_COMPACT_CLASS, STAR_TAP_CLASS } from '@/components/common/StarRating'
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
    phone: '',
    memo: '',
    estimated_cost: null,
    photos: [],
    ...overrides,
  }
}

afterEach(cleanup)

// 기본은 보여 주기다 — 입력창은 연필을 눌러야 나온다 (사용자 요청).
// 카드가 늘 편집 상태라 길어져 스크롤까지 하게 됐던 것이 이 변경의 이유다
function openEdit() {
  fireEvent.click(screen.getByRole('button', { name: '고치기' }))
}

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

    openEdit()
    fireEvent.change(screen.getByLabelText('예상 금액'), { target: { value: '20000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSaveEstimatedCost).toHaveBeenCalledWith(20000)
  })

  it('치는 동안 천 단위가 보인다 — 0이 몇 개인지 눈으로 세지 않게', () => {
    render(<PreviewCard place={place()} variant="sheet" onSaveEstimatedCost={vi.fn()} />)

    openEdit()
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

    openEdit()
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

    openEdit()
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
    openEdit()
    expect((screen.getByLabelText('메모') as HTMLTextAreaElement).value).toBe('흑돼지 두 근')
    expect(screen.getByRole('button', { name: '저장하기' })).toBeTruthy()
    expect(screen.getByLabelText('사진 담기')).toBeTruthy()
  })

  it('메모를 고쳐 저장하면 그대로 넘긴다 (E-09 / FR-009)', async () => {
    const onSaveMemo = vi.fn().mockResolvedValue(undefined)
    render(<PreviewCard variant="sheet" place={place()} onSaveMemo={onSaveMemo} />)

    openEdit()
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

describe('PreviewCard — 읽기가 기본, 연필로 고친다 (사용자 요청)', () => {
  it('입력창을 미리 펴 두지 않는다 — 늘 편집 상태라 카드가 길어져 스크롤까지 했다', () => {
    render(<PreviewCard place={place()} variant="sheet" onSaveMemo={vi.fn()} onSaveEstimatedCost={vi.fn()} />)

    expect(screen.queryByLabelText('메모')).toBeNull()
    expect(screen.queryByLabelText('예상 금액')).toBeNull()
    expect(screen.getByRole('button', { name: '고치기' })).toBeTruthy()
  })

  it('저장해 둔 것을 읽을 수 있게 낸다 — 전화·메모·예상 금액', () => {
    render(
      <PreviewCard
        place={place({ phone: '064-123-4567', memo: '9시 전에', estimated_cost: 20000 })}
        variant="sheet"
        onSaveMemo={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: '064-123-4567' }).getAttribute('href')).toBe(
      'tel:064-123-4567',
    )
    expect(screen.getByText('9시 전에')).toBeTruthy()
    expect(screen.getByText(/20,000/)).toBeTruthy()
  })

  it('영업시간은 담지 못하니 네이버 상세로 넘긴다 — 어느 공개 API 도 주지 않는다', () => {
    render(<PreviewCard place={place()} variant="sheet" onSaveMemo={vi.fn()} />)

    expect(screen.getByRole('link', { name: '네이버에서 열기' }).getAttribute('href')).toBe(
      'https://map.naver.com/p/1',
    )
    expect(screen.getByText(/영업시간은 여기서/)).toBeTruthy()
  })

  it('연필을 누르면 입력창이 나온다', () => {
    render(<PreviewCard place={place({ memo: '9시 전에' })} variant="sheet" onSaveMemo={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '고치기' }))

    expect(screen.getByLabelText('메모')).toBeTruthy()
    expect(screen.getByRole('button', { name: '고치기 그만두기' })).toBeTruthy()
  })
})


describe('PreviewCard — 현장에서 3탭에 바꾼다 (T10-23 · 결정 #53)', () => {
  const DAYS = [
    { id: 'd1', label: '1일차' },
    { id: 'd2', label: '2일차' },
  ]
  const CANDIDATES = [
    {
      place: { ...place(), id: 'p3', name: '가시아방국수', lat: 33.503, lng: 126.5 },
      meters: 334,
      stars: 7,
      placedLabel: null,
    },
    {
      place: { ...place(), id: 'p4', name: '맛나식당', lat: 33.56, lng: 126.5 },
      meters: 1240,
      stars: 0,
      placedLabel: '3일차 1번째에 있어요',
    },
  ]

  function renderSwappable(props: Record<string, unknown> = {}) {
    const onSwap = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        days={DAYS}
        placedCount={1}
        swapOptions={CANDIDATES}
        onSwap={onSwap}
        {...props}
      />,
    )
    return onSwap
  }

  it('일정에 있는 곳이면 바꾸는 문을 낸다', () => {
    renderSwappable()

    expect(screen.getByRole('button', { name: '다른 곳으로 바꾸기' })).toBeTruthy()
  })

  it('보관함에만 있는 곳에는 바꿀 자리가 없다', () => {
    renderSwappable({ placedCount: 0 })

    expect(screen.queryByRole('button', { name: '다른 곳으로 바꾸기' })).toBeNull()
  })

  it('누르면 이 자리에 대신 갈 곳이 거리와 함께 뜬다', () => {
    renderSwappable()
    fireEvent.click(screen.getByRole('button', { name: '다른 곳으로 바꾸기' }))

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    const first = within(list).getAllByRole('button')[0]
    expect(first.getAttribute('aria-label')).toContain('가시아방국수')
    expect(first.textContent).toContain('334m')
    expect(within(list).getByText('3일차 1번째에 있어요')).toBeTruthy()
  })

  it('후보를 누르면 그 자리에 넣는다 — 확인은 묻지 않는다', async () => {
    const onSwap = renderSwappable()
    fireEvent.click(screen.getByRole('button', { name: '다른 곳으로 바꾸기' }))

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    await act(async () => {
      fireEvent.click(within(list).getAllByRole('button')[0])
    })

    expect(onSwap).toHaveBeenCalledWith('p3')
  })

  it('바꾸고 나면 어디로 갔는지 말하고 되돌릴 문을 남긴다', async () => {
    const onSwap = renderSwappable()
    fireEvent.click(screen.getByRole('button', { name: '다른 곳으로 바꾸기' }))

    const list = screen.getByRole('list', { name: '흑돼지집 자리에 대신 갈 곳' })
    await act(async () => {
      fireEvent.click(within(list).getAllByRole('button')[0])
    })

    expect(screen.getByText(/가시아방국수로 바꿨어요/)).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }))
    })

    expect(onSwap).toHaveBeenLastCalledWith('p1')
  })
})


describe('PreviewCard — 좁은 패널에서 별이 넘치지 않는다 (사용자 지적)', () => {
  const VOTE = { mine: 3, total: 7, voters: 2 }

  it('데스크톱 오른쪽 패널은 compact — 44px 다섯이면 380px 패널을 넘는다', () => {
    render(
      <PreviewCard place={place()} variant="sheet" starSize="compact" vote={VOTE} onVote={vi.fn()} />,
    )

    for (const star of screen.getAllByRole('radio')) {
      expect(star.className).toContain(STAR_COMPACT_CLASS)
      expect(star.className).not.toContain(STAR_TAP_CLASS)
    }
  })

  it('따로 말하지 않으면 손가락 크기다 — 모바일 시트가 기본이다', () => {
    render(<PreviewCard place={place()} variant="sheet" vote={VOTE} onVote={vi.fn()} />)

    for (const star of screen.getAllByRole('radio')) {
      expect(star.className).toContain(STAR_TAP_CLASS)
    }
  })
})

describe('PreviewCard — 전화번호는 손으로 적는다 (사용자 지적)', () => {
  // 네이버 지역검색의 `telephone` 은 **항상 빈 문자열**이다 (2026-08-21 실호출 10건 전부).
  // 결정 #52 가 "네이버가 주는데 프록시가 버렸다"고 적은 것은 틀렸다 — 필드만 있고 값이 안 온다.
  it('편집에서 전화번호를 적어 저장한다', async () => {
    const onSavePhone = vi.fn().mockResolvedValue(undefined)
    render(<PreviewCard place={place()} variant="sheet" onSavePhone={onSavePhone} />)

    fireEvent.click(screen.getByRole('button', { name: '고치기' }))
    fireEvent.change(screen.getByLabelText('전화번호'), { target: { value: '064-123-4567' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSavePhone).toHaveBeenCalledWith('064-123-4567')
  })

  it('적어 둔 번호는 눌러서 걸 수 있다', () => {
    render(<PreviewCard place={place({ phone: '064-123-4567' })} variant="sheet" />)

    const link = screen.getByRole('link', { name: '064-123-4567' })
    expect(link.getAttribute('href')).toBe('tel:064-123-4567')
  })

  it('안 적었으면 전화 줄을 아예 내지 않는다 — 빈 칸이 자리를 먹지 않는다', () => {
    render(<PreviewCard place={place()} variant="sheet" />)

    expect(screen.queryByText('전화')).toBeNull()
  })
})

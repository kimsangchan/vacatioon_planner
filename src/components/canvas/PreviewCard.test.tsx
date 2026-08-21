/** @vitest-environment jsdom */
// T6-4b — 미리보기 (FR-006). 데스크톱 호버는 카드, 모바일 탭은 바텀시트 —
// 같은 컴포넌트의 두 얼굴이다. 사진이 없어도 기능은 성립해야 한다 (PRD 엣지케이스).

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PhotoError } from '@/lib/photo/upload'
import type { PhotoRow, PlaceRow } from '@/lib/trips/bundle'
import { HEART_COMPACT_CLASS, HEART_TAP_CLASS } from '@/components/common/HeartVote'
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
    category_label: '',
    phone: '',
    opening_hours: '',
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

  // 문구를 사실에 맞췄다 (결정 #62): 이 링크는 지도가 아니라 업체가 올린 인스타·홈페이지다
  it('가게가 올린 링크가 있을 때만 새 탭으로 준다 (FR-009)', () => {
    const { unmount } = render(<PreviewCard variant="sheet" place={place()} />)

    const link = screen.getByRole('link', { name: '가게 홈페이지·SNS' }) as HTMLAnchorElement
    expect(link.href).toBe('https://map.naver.com/p/1')
    expect(link.target).toBe('_blank')
    expect(link.rel).toContain('noreferrer')

    unmount()
    render(<PreviewCard variant="sheet" place={place({ provider: 'manual', provider_link: null })} />)
    expect(screen.queryByRole('link', { name: '가게 홈페이지·SNS' })).toBeNull()
    // 지도 링크는 링크가 없어도 항상 있다 — 막다른 길을 만들지 않는다
    expect(screen.getByRole('link', { name: '네이버 지도에서 보기' })).toBeTruthy()
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

  it('적어 둔 여러 줄 영업시간을 읽기 화면에 그대로 내고 네이버 상세 링크도 남긴다', () => {
    render(
      <PreviewCard
        place={place({ opening_hours: '평일 09:00–18:00\n주말 10:00–17:00' })}
        variant="sheet"
        onSaveMemo={vi.fn()}
      />,
    )

    expect(screen.getByRole('link', { name: '네이버에서 열기' }).getAttribute('href')).toBe(
      'https://map.naver.com/p/1',
    )
    const hours = screen.getByText('영업시간').nextElementSibling as HTMLElement
    expect(hours.textContent).toBe('평일 09:00–18:00\n주말 10:00–17:00')
    expect(hours.className).toContain('whitespace-pre-wrap')
  })

  it('연필을 누르면 입력창이 나온다', () => {
    render(<PreviewCard place={place({ memo: '9시 전에' })} variant="sheet" onSaveMemo={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '고치기' }))

    expect(screen.getByLabelText('메모')).toBeTruthy()
    expect(screen.getByRole('button', { name: '고치기 그만두기' })).toBeTruthy()
  })
})

describe('PreviewCard — 영업시간을 편하게 적는다 (사용자 요청)', () => {
  it('같은 장소의 최신 영업시간을 다시 받으면 편집값도 최신 상태로 연다', () => {
    const onSaveOpeningHours = vi.fn()
    const { rerender } = render(
      <PreviewCard
        place={place({ opening_hours: '매일 09:00–18:00' })}
        variant="sheet"
        onSaveOpeningHours={onSaveOpeningHours}
      />,
    )

    rerender(
      <PreviewCard
        place={place({ opening_hours: '매일 10:00–19:00' })}
        variant="sheet"
        onSaveOpeningHours={onSaveOpeningHours}
      />,
    )
    openEdit()

    expect((screen.getByLabelText('영업시간') as HTMLTextAreaElement).value).toBe(
      '매일 10:00–19:00',
    )
  })

  it('직접 적는 동안 재조회되어도 아직 저장하지 않은 내용은 덮어쓰지 않는다', () => {
    const onSaveOpeningHours = vi.fn()
    const { rerender } = render(
      <PreviewCard
        place={place({ opening_hours: '매일 09:00–18:00' })}
        variant="sheet"
        onSaveOpeningHours={onSaveOpeningHours}
      />,
    )
    openEdit()
    fireEvent.change(screen.getByLabelText('영업시간'), {
      target: { value: '화요일 예약제' },
    })

    rerender(
      <PreviewCard
        place={place({ opening_hours: '매일 10:00–19:00' })}
        variant="sheet"
        onSaveOpeningHours={onSaveOpeningHours}
      />,
    )

    expect((screen.getByLabelText('영업시간') as HTMLTextAreaElement).value).toBe(
      '화요일 예약제',
    )
  })

  it('빠른 입력으로 자주 쓰는 형식을 채우고 여러 줄 그대로 저장한다', async () => {
    const onSaveOpeningHours = vi.fn().mockResolvedValue(undefined)
    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        onSaveOpeningHours={onSaveOpeningHours}
      />,
    )

    openEdit()
    fireEvent.click(screen.getByRole('button', { name: '평일/주말' }))

    expect((screen.getByLabelText('영업시간') as HTMLTextAreaElement).value).toBe(
      '평일 09:00–18:00\n주말 10:00–17:00',
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    })

    expect(onSaveOpeningHours).toHaveBeenCalledWith(
      '평일 09:00–18:00\n주말 10:00–17:00',
    )
  })

  it.each([
    ['매일 09:00–18:00', '매일 09:00–18:00'],
    ['24시간', '24시간'],
    ['예약제', '예약제'],
  ])('%s 빠른 입력을 제공한다', (buttonName, expected) => {
    render(<PreviewCard place={place()} variant="sheet" onSaveOpeningHours={vi.fn()} />)

    openEdit()
    fireEvent.click(screen.getByRole('button', { name: buttonName }))

    expect((screen.getByLabelText('영업시간') as HTMLTextAreaElement).value).toBe(expected)
  })

  it('정해진 형식이 아닌 여러 줄도 직접 적을 수 있고 한 번에 지운다', () => {
    render(
      <PreviewCard
        place={place({ opening_hours: '월요일 휴무' })}
        variant="sheet"
        onSaveOpeningHours={vi.fn()}
      />,
    )

    openEdit()
    const input = screen.getByLabelText('영업시간')
    fireEvent.change(input, { target: { value: '화–금 11:30–21:00\n브레이크 15:00–17:00' } })
    expect((input as HTMLTextAreaElement).value).toBe(
      '화–금 11:30–21:00\n브레이크 15:00–17:00',
    )

    fireEvent.click(screen.getByRole('button', { name: '영업시간 지우기' }))
    expect((input as HTMLTextAreaElement).value).toBe('')
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
      hearts: 2,
      placedLabel: null,
    },
    {
      place: { ...place(), id: 'p4', name: '맛나식당', lat: 33.56, lng: 126.5 },
      meters: 1240,
      hearts: 0,
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


describe('PreviewCard — 좁은 패널에서 넘치지 않는다 (사용자 지적)', () => {
  const HEART = { hearts: 2, mine: true, names: ['민수'] }

  it('데스크톱 오른쪽 패널은 compact — 380px 패널을 넘으면 안 된다', () => {
    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        heartSize="compact"
        heart={HEART}
        onHeart={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: /가고 싶어요/ })
    expect(button.className).toContain(HEART_COMPACT_CLASS)
    expect(button.className).not.toContain(HEART_TAP_CLASS)
  })

  it('따로 말하지 않으면 손가락 크기다 — 모바일 시트가 기본이다', () => {
    render(<PreviewCard place={place()} variant="sheet" heart={HEART} onHeart={vi.fn()} />)

    expect(screen.getByRole('button', { name: /가고 싶어요/ }).className).toContain(HEART_TAP_CLASS)
  })

  it('누가 눌렀는지 카드에서 바로 읽힌다', () => {
    render(<PreviewCard place={place()} variant="sheet" heart={HEART} onHeart={vi.fn()} />)

    expect(screen.getByText('민수 외 1명이 가고 싶어해요')).toBeTruthy()
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


describe('PreviewCard — 하던 일이 끝나기 전에 누른 것도 잃지 않는다 (E2E 가 잡은 회귀)', () => {
  // `run()` 이 `if (busy) return` 으로 **조용히 버렸다**. 저장하기를 누르고 곧바로 사진을 담으면
  // 아무 일도 안 일어나고 이유도 안 알려 줬다 — 게다가 파일 입력은 이미 비워져 재시도도 막혔다.
  it('저장이 끝나기 전에 고른 사진도 담긴다', async () => {
    let finishSave: () => void = () => {}
    const onSaveMemo = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve
        }),
    )
    const onAddPhoto = vi.fn().mockResolvedValue(undefined)

    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        onSaveMemo={onSaveMemo}
        onAddPhoto={onAddPhoto}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '고치기' }))
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '9시 전에 가기' } })
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    // busy 가 **화면에 반영된 뒤에** 골라야 옛 가드(`if (busy) return`)를 실제로 지나간다.
    // 이 한 틱을 안 주면 테스트가 통과해 버린다 — 거짓 초록불이었다
    await act(async () => {
      await Promise.resolve()
    })

    // 저장이 아직 끝나지 않은 사이에 사진을 고른다
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('사진 담기'), { target: { files: [file] } })
    })

    await act(async () => {
      finishSave()
      await Promise.resolve()
    })

    expect(onSaveMemo).toHaveBeenCalledWith('9시 전에 가기')
    expect(onAddPhoto).toHaveBeenCalledWith(file)
  })

  it('먼저 시킨 일이 끝난 뒤에 다음 일이 간다 — 순서가 뒤집히지 않는다', async () => {
    const order: string[] = []
    let finishSave: () => void = () => {}
    const onSaveMemo = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = () => {
            order.push('save')
            resolve()
          }
        }),
    )
    const onAddPhoto = vi.fn(async () => {
      order.push('photo')
    })

    render(
      <PreviewCard
        place={place()}
        variant="sheet"
        onSaveMemo={onSaveMemo}
        onAddPhoto={onAddPhoto}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '고치기' }))
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '메모' } })
    fireEvent.click(screen.getByRole('button', { name: '저장하기' }))
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.change(screen.getByLabelText('사진 담기'), {
        target: { files: [new File(['x'], 'p.png', { type: 'image/png' })] },
      })
    })

    await act(async () => {
      finishSave()
      await Promise.resolve()
    })

    expect(order).toEqual(['save', 'photo'])
  })
})


describe('PreviewCard — 이게 뭐 하는 데인지 알려 준다 (결정 #62)', () => {
  it('업종을 그대로 보여 준다 — 아이콘만으로는 카페인지 밥집인지 모른다', () => {
    render(<PreviewCard place={place({ category_label: '한식>국수' })} variant="sheet" />)

    expect(screen.getByText('한식>국수')).toBeTruthy()
  })

  it('업종이 없으면 그 줄을 아예 내지 않는다 — 직접 찍은 곳이 그렇다', () => {
    render(<PreviewCard place={place()} variant="sheet" />)

    expect(screen.queryByText('업종')).toBeNull()
  })

  it('네이버 지도로 한 탭에 넘어간다 — 이름만으로는 엉뚱한 지역이 나온다', () => {
    render(<PreviewCard place={place()} variant="sheet" />)

    const link = screen.getByRole('link', { name: '네이버 지도에서 보기' })
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toBe(
      'https://map.naver.com/p/search/제주시 흑돼지집',
    )
  })

  it('가게가 올린 링크는 그대로 연다 — 실제로는 인스타·홈페이지다', () => {
    render(
      <PreviewCard
        place={place({ provider_link: 'https://www.instagram.com/heukdwaeji' })}
        variant="sheet"
      />,
    )

    const link = screen.getByRole('link', { name: '가게 홈페이지·SNS' })
    expect(link.getAttribute('href')).toBe('https://www.instagram.com/heukdwaeji')
  })
})

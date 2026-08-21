/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceRow } from '@/lib/trips/bundle'
import { ListPane } from './ListPane'

function place(
  id: string,
  name: string,
  category: PlaceRow['category'],
  address: string,
  roadAddress = '',
): PlaceRow {
  return {
    id,
    trip_id: 'trip-1',
    category,
    name,
    address,
    road_address: roadAddress,
    lat: 33.5,
    lng: 126.5,
    provider: 'naver',
    provider_link: null,
    category_label: '',
    phone: '',
    opening_hours: '',
    memo: '',
    estimated_cost: null,
    photos: [],
  }
}

const places = [
  place('p1', '흑돼지집', 'restaurant', '제주시 노형동'),
  place('p2', '바다식당', 'restaurant', '서귀포시 성산읍'),
  place('p3', '제주호텔', 'lodging', '제주시 연동'),
  place('p4', '성산일출봉', 'spot', '서귀포시', '제주특별자치도 서귀포시 성산읍'),
]

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

function renderPane(scrollTarget: { id: string; nonce: number } | null = null) {
  return render(
    <ListPane
      unassigned={places}
      days={[]}
      places={places}
      highlightedId={null}
      scrollTarget={scrollTarget}
      onHover={vi.fn()}
      onSelect={vi.fn()}
    />,
  )
}

function storage() {
  return screen.getByRole('region', { name: /보관함/ })
}

describe('ListPane — 보관함 분류와 검색', () => {
  it('전체·식당·숙박·스팟 필터에 각각 개수를 보이고 선택 상태를 알린다', () => {
    renderPane()

    expect(screen.getByRole('button', { name: '전체 4' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '식당 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '숙박 1' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '스팟 1' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '식당 2' }))

    expect(screen.getByRole('button', { name: '식당 2' }).getAttribute('aria-pressed')).toBe('true')
    expect(storage().textContent).toContain('흑돼지집')
    expect(storage().textContent).toContain('바다식당')
    expect(storage().textContent).not.toContain('제주호텔')
    expect(storage().textContent).not.toContain('성산일출봉')
  })

  it('보이는 검색 라벨을 제공하고 이름과 주소를 모두 검색한다', () => {
    renderPane()

    expect(screen.getByText('보관함 검색')).toBeTruthy()
    const query = screen.getByLabelText('보관함 검색')

    fireEvent.change(query, { target: { value: '호텔' } })
    expect(storage().textContent).toContain('제주호텔')
    expect(storage().textContent).not.toContain('흑돼지집')

    fireEvent.change(query, { target: { value: '성산읍' } })
    expect(storage().textContent).toContain('바다식당')
    expect(storage().textContent).toContain('성산일출봉')
    expect(storage().textContent).not.toContain('제주호텔')
  })

  it('결과가 없으면 이유와 필터 초기화 버튼을 보여 주고 한 번에 전체 목록으로 돌아간다', () => {
    renderPane()

    fireEvent.click(screen.getByRole('button', { name: '숙박 1' }))
    const query = screen.getByLabelText('보관함 검색') as HTMLInputElement
    fireEvent.change(query, { target: { value: '성산' } })

    expect(storage().textContent).toContain('조건에 맞는 장소가 없어요')
    expect(within(storage()).queryByTestId('place-item-p3')).toBeNull()

    fireEvent.click(within(storage()).getByRole('button', { name: '필터 초기화' }))

    expect(query.value).toBe('')
    expect(screen.getByRole('button', { name: '전체 4' }).getAttribute('aria-pressed')).toBe('true')
    expect(within(storage()).getAllByTestId(/place-item-/)).toHaveLength(4)
  })

  it('핀으로 찾은 장소가 검색과 카테고리에 가려져 있으면 두 조건을 모두 초기화한다', () => {
    const view = renderPane()

    fireEvent.click(screen.getByRole('button', { name: '숙박 1' }))
    fireEvent.change(screen.getByLabelText('보관함 검색'), { target: { value: '호텔' } })
    expect(screen.queryByTestId('place-item-p1')).toBeNull()

    view.rerender(
      <ListPane
        unassigned={places}
        days={[]}
        places={places}
        highlightedId="p1"
        scrollTarget={{ id: 'p1', nonce: 1 }}
        onHover={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect((screen.getByLabelText('보관함 검색') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: '전체 4' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('place-item-p1')).toBeTruthy()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    view.rerender(
      <ListPane
        unassigned={places}
        days={[]}
        places={places}
        highlightedId={null}
        scrollTarget={null}
        onHover={vi.fn()}
        onSelect={vi.fn()}
      />,
    )

    expect((screen.getByLabelText('보관함 검색') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: '전체 4' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('핀 위치로 한 번 스크롤한 뒤 필터를 조작해도 같은 핀으로 다시 끌려가지 않는다', () => {
    renderPane({ id: 'p1', nonce: 1 })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '식당 2' }))
    fireEvent.change(screen.getByLabelText('보관함 검색'), { target: { value: '흑돼지' } })

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)
  })
})

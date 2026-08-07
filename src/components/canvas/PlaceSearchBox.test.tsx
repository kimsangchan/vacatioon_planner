/** @vitest-environment jsdom */
// T6-2 — 검색→저장 플로우 (FR-003 / SC-001). 사용자 결정은 정확히 3지점이어야 한다:
// ① 검색어 입력 ② 결과 선택 ③ 카테고리 확정. 확인 대화상자를 끼우면 이 파일이 깨진다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlaceError } from '@/lib/place/api'
import { PlaceSearchBox } from './PlaceSearchBox'

const SEONGSAN = {
  name: '성산일출봉',
  address: '제주특별자치도 서귀포시 성산읍 성산리 1',
  roadAddress: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
  lat: 33.4581,
  lng: 126.9425,
  categoryHint: 'spot' as const,
  providerLink: 'https://map.naver.com/p/1',
  provider: 'naver' as const,
}

const HEUKDWAEJI = {
  name: '흑돼지집',
  address: '제주특별자치도 제주시 연동 1',
  roadAddress: '제주특별자치도 제주시 노형로 1',
  lat: 33.4996,
  lng: 126.5312,
  categoryHint: 'restaurant' as const,
  providerLink: null,
  provider: 'naver' as const,
}

function jsonOnce(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function problem(status: number, detail: string) {
  return new Response(
    JSON.stringify({
      type: 'search/quota-exceeded',
      title: '오늘 검색을 다 썼어요',
      status,
      detail,
    }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  )
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value } })
}

describe('PlaceSearchBox — 디바운스 (T6-2)', () => {
  it('입력이 멈추고 300ms 뒤에 딱 한 번 검색한다', async () => {
    fetchMock.mockResolvedValue(jsonOnce([SEONGSAN]))
    render(<PlaceSearchBox onSave={vi.fn()} />)

    type('성')
    type('성산')
    type('성산일')
    await tick(299)
    expect(fetchMock).not.toHaveBeenCalled()

    await tick(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      `/api/place-search?q=${encodeURIComponent('성산일')}`,
    )
  })

  it('두 글자 미만은 서버를 부르지 않는다 (400 을 미리 막는다)', async () => {
    render(<PlaceSearchBox onSave={vi.fn()} />)

    type('성')
    await tick(400)

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('PlaceSearchBox — 결정 3지점 (SC-001)', () => {
  it('검색어 입력·결과 선택·카테고리 확정 세 번으로 저장까지 끝난다', async () => {
    fetchMock.mockResolvedValue(jsonOnce([HEUKDWAEJI, SEONGSAN]))
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PlaceSearchBox onSave={onSave} />)

    // 결정 ①
    type('흑돼지')
    await tick(300)

    // 결과는 5건까지, 이름·주소·카테고리 힌트 뱃지가 함께 보인다
    const results = screen.getAllByRole('button', { name: /제주특별자치도/ })
    expect(results.length).toBeLessThanOrEqual(5)
    expect(results[0].textContent).toContain('흑돼지집')
    expect(results[0].textContent).toContain('식당')

    // 결정 ②
    fireEvent.click(results[0])

    // 힌트가 기본으로 골라져 있는 3버튼 — 확인 대화상자는 없다
    const suggested = screen.getByRole('button', { name: '식당으로 담기' })
    expect(suggested.dataset.suggested).toBe('true')
    expect(screen.getByRole('button', { name: '숙박으로 담기' }).dataset.suggested).toBeUndefined()
    expect(screen.getByRole('button', { name: '스팟으로 담기' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()

    // 결정 ③ — 카테고리 확정이 곧 저장이다
    fireEvent.click(suggested)
    await tick(0)

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      category: 'restaurant',
      name: '흑돼지집',
      address: HEUKDWAEJI.address,
      road_address: HEUKDWAEJI.roadAddress,
      lat: HEUKDWAEJI.lat,
      lng: HEUKDWAEJI.lng,
      provider: 'naver',
      provider_link: null,
    })
    expect(screen.getByRole('status').textContent).toContain('보관함에 담았어요')
  })

  it('힌트와 다른 카테고리를 골라도 그 값으로 담는다 (최종 확정은 사용자)', async () => {
    fetchMock.mockResolvedValue(jsonOnce([SEONGSAN]))
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<PlaceSearchBox onSave={onSave} />)

    type('성산')
    await tick(300)
    fireEvent.click(screen.getByRole('button', { name: /성산일출봉/ }))
    fireEvent.click(screen.getByRole('button', { name: '숙박으로 담기' }))
    await tick(0)

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'lodging', provider_link: SEONGSAN.providerLink }),
    )
  })
})

describe('PlaceSearchBox — 분기 (PRD 엣지케이스 / L-06)', () => {
  it('0건이면 다른 이름·지도 롱프레스 대안을 알려준다', async () => {
    fetchMock.mockResolvedValue(jsonOnce([]))
    render(<PlaceSearchBox onSave={vi.fn()} />)

    type('없는가게')
    await tick(300)

    const status = screen.getByRole('status')
    expect(status.textContent).toContain('다른 이름으로 찾아보거나')
    expect(status.textContent).toContain('길게 눌러')
  })

  it('429 는 서버가 준 문구를 그대로 보여주고 다시 검색하기를 준다', async () => {
    fetchMock.mockResolvedValueOnce(problem(429, '내일 다시 검색할 수 있어요.'))
    render(<PlaceSearchBox onSave={vi.fn()} />)

    type('성산')
    await tick(300)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('내일 다시 검색할 수 있어요.')

    fetchMock.mockResolvedValueOnce(jsonOnce([SEONGSAN]))
    fireEvent.click(screen.getByRole('button', { name: '다시 검색하기' }))
    await tick(300)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('502 도 같은 자리에서 다음 행동을 준다', async () => {
    fetchMock.mockResolvedValueOnce(
      problem(502, '잠시 뒤에 다시 검색하거나, 지도에서 길게 눌러 직접 등록해 보세요.'),
    )
    render(<PlaceSearchBox onSave={vi.fn()} />)

    type('성산')
    await tick(300)

    expect(screen.getByRole('alert').textContent).toContain('길게 눌러')
    expect(screen.getByRole('button', { name: '다시 검색하기' })).toBeTruthy()
  })

  it('중복(23505)이면 담아둔 곳으로 데려간다 — 덮어쓰기 없음', async () => {
    fetchMock.mockResolvedValue(jsonOnce([SEONGSAN]))
    const onSave = vi
      .fn()
      .mockRejectedValue(new PlaceError('conflict/duplicate', undefined, 'place-1'))
    const onShowExisting = vi.fn()
    render(<PlaceSearchBox onSave={onSave} onShowExisting={onShowExisting} />)

    type('성산')
    await tick(300)
    fireEvent.click(screen.getByRole('button', { name: /성산일출봉/ }))
    fireEvent.click(screen.getByRole('button', { name: '스팟으로 담기' }))
    await tick(0)

    expect(screen.getByRole('alert').textContent).toContain('이미 담아둔 곳이에요')

    fireEvent.click(screen.getByRole('button', { name: '담아둔 곳 보기' }))
    expect(onShowExisting).toHaveBeenCalledWith('place-1')
  })
})

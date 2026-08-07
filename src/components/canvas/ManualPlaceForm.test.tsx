/** @vitest-environment jsdom */
// T6-5 — 검색으로 못 찾는 곳은 지도에서 직접 찍는다 (FR-016 / E-04 provider=manual).
// 좌표는 지도 이벤트가 이미 확정했으므로, 폼이 물어보는 건 이름과 카테고리뿐이다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlaceError } from '@/lib/place/api'
import { ManualPlaceForm } from './ManualPlaceForm'

const LAT_LNG = { lat: 33.4996, lng: 126.5312 }

afterEach(cleanup)

function fill(name: string) {
  fireEvent.change(screen.getByLabelText('장소 이름'), { target: { value: name } })
}

describe('ManualPlaceForm — 이 자리에 담기 (FR-016)', () => {
  it('길게 누른 자리의 좌표를 보여준다', () => {
    render(<ManualPlaceForm latLng={LAT_LNG} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByTestId('manual-place-form').textContent).toContain('33.4996, 126.5312')
  })

  it('이름을 적기 전에는 담기지 않는다', () => {
    render(<ManualPlaceForm latLng={LAT_LNG} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect((screen.getByRole('button', { name: '이 자리에 담기' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('이름·카테고리를 정하면 provider=manual 로 담는다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ManualPlaceForm latLng={LAT_LNG} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fill('이름 없는 전망대')
    fireEvent.click(screen.getByRole('button', { name: '스팟' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 자리에 담기' }))
    })

    expect(onSubmit).toHaveBeenCalledWith({
      category: 'spot',
      name: '이름 없는 전망대',
      address: '',
      road_address: '',
      lat: 33.4996,
      lng: 126.5312,
      provider: 'manual',
      provider_link: null,
    })
  })

  it('카테고리 3종을 모두 고를 수 있다', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ManualPlaceForm latLng={LAT_LNG} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fill('바다 앞 국수집')
    fireEvent.click(screen.getByRole('button', { name: '식당' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 자리에 담기' }))
    })

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ category: 'restaurant' }))
    expect(screen.getByRole('button', { name: '숙박' })).toBeTruthy()
  })

  it('중복이면 막다른 에러 대신 다음 행동을 준다 (L-06)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new PlaceError('conflict/duplicate'))
    render(<ManualPlaceForm latLng={LAT_LNG} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fill('성산일출봉')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 자리에 담기' }))
    })

    expect(screen.getByRole('alert').textContent).toContain('이미 담아둔 곳이에요')
  })

  it('그만두면 폼을 닫는다', () => {
    const onCancel = vi.fn()
    render(<ManualPlaceForm latLng={LAT_LNG} onSubmit={vi.fn()} onCancel={onCancel} />)

    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

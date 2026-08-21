/** @vitest-environment jsdom */
// T10-24 — 별표를 손가락으로 누를 수 있게 한다 (사용자 지적: "모바일에서 터치하는게 쉽지가 않더라").
//
// 별 다섯이 24px 로 **간격 없이** 붙어 있었다. 3점을 누르려다 4점이 눌린다.
// 손가락 최소치는 44px 다 — 다만 PC 말풍선까지 키우면 말풍선이 길어져 결정 #52 를 깬다.
// 그래서 크기를 **골라 쓴다**: 손가락 화면은 touch(기본), 마우스 전용 말풍선만 compact.
//
// jsdom 에는 레이아웃이 없다(src/components/CLAUDE.md 함정) — 여기서는 **계약**만 지키고,
// 실제 픽셀은 e2e/sc-004 의 390×844 계측이 잰다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { STAR_TAP_CLASS, STAR_COMPACT_CLASS, StarRating } from './StarRating'

afterEach(cleanup)

describe('StarRating — 손가락으로 누를 수 있나', () => {
  it('기본은 손가락 크기다 — 별 다섯이 모두 44px 타깃', () => {
    render(<StarRating label="흑돼지집" mine={2} onChange={vi.fn()} />)

    const stars = screen.getAllByRole('radio')
    expect(stars).toHaveLength(5)
    for (const star of stars) {
      expect(star.className).toContain(STAR_TAP_CLASS)
    }
  })

  it('마우스 전용 자리는 compact 로 줄인다 — 말풍선이 길어지면 안 된다 (#52)', () => {
    render(<StarRating label="흑돼지집" mine={2} size="compact" onChange={vi.fn()} />)

    for (const star of screen.getAllByRole('radio')) {
      expect(star.className).toContain(STAR_COMPACT_CLASS)
      expect(star.className).not.toContain(STAR_TAP_CLASS)
    }
  })

  it('읽기 전용은 누를 것이 없으니 크기도 그대로 둔다', () => {
    render(<StarRating label="흑돼지집" mine={3} />)

    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    expect(screen.getByRole('img', { name: '흑돼지집 별점 3점' })).toBeTruthy()
  })

  it('타깃이 커져도 고르는 값은 그대로다 — 4점을 누르면 4점', () => {
    const onChange = vi.fn()
    render(<StarRating label="흑돼지집" mine={2} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: '흑돼지집 별 4점' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('이미 준 별을 다시 누르면 취소다', () => {
    const onChange = vi.fn()
    render(<StarRating label="흑돼지집" mine={4} onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: '흑돼지집 별 4점 취소' }))
    expect(onChange).toHaveBeenCalledWith(0)
  })
})

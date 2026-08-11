/** @vitest-environment jsdom */
// 06 부록 체크리스트 4·5 — 없는 주소로 들어와도 막다른 화면이 되면 안 된다 (L-06),
// 그 화면의 강조 CTA 도 하나뿐이다 (L-09).

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import NotFound from './not-found'

afterEach(cleanup)

describe('404 화면 (SPEC §UI 규칙 — 막다른 에러 금지)', () => {
  it('무슨 일인지 해요체로 알리고 다음 행동 버튼을 둔다', () => {
    render(<NotFound />)

    expect(screen.getByRole('heading').textContent).toContain('찾는 페이지가 없어요')

    const next = screen.getByRole('link', { name: '여행 목록으로' })
    expect(next.getAttribute('href')).toBe('/')
  })

  it('강조 CTA 는 여행 목록으로 하나뿐이다 (L-09)', () => {
    const { container } = render(<NotFound />)

    const emphasized = container.querySelectorAll('[class*="bg-foreground"]')
    expect(emphasized).toHaveLength(1)
    expect(emphasized[0]?.textContent).toBe('여행 목록으로')
  })
})

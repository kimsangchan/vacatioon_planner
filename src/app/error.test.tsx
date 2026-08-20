/** @vitest-environment jsdom */
// 06 부록 체크리스트 4·5 — 에러 화면도 막다른 곳이 되면 안 되고 (L-06), 강조 CTA 는 하나다 (L-09).
//
// '다시 열기'와 '여행 목록으로'만 있으면 세션이 원인일 때 둘 다 같은 실패로 되돌아온다.
// (실제 사건: 토큰의 발급 시각이 미래로 찍혀 데이터 조회가 계속 거부됐다 — 목록 화면 자체가 열리지 않아
//  거기 있는 로그아웃 버튼에 닿을 수 없었다.) 그래서 여기에도 같은 탈출구를 둔다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import AppError from './error'

afterEach(cleanup)

describe('에러 화면 (SPEC §UI 규칙 — 막다른 에러 금지)', () => {
  it('무슨 일인지 알리고 다시 열어 볼 수 있게 한다', () => {
    const reset = vi.fn()
    render(<AppError error={new Error('boom')} reset={reset} />)

    expect(screen.getByRole('heading').textContent).toContain('화면을 여는 데 실패했어요')

    fireEvent.click(screen.getByRole('button', { name: '다시 열기' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('다시 열어도 같은 실패면 세션을 버리고 나갈 수 있다', () => {
    render(<AppError error={new Error('boom')} reset={vi.fn()} />)

    const escape = screen.getByRole('button', { name: '로그아웃하기' })
    const form = escape.closest('form')
    expect(form?.getAttribute('action')).toBe('/auth/signout')
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('post')
  })

  it('강조 CTA 는 다시 열기 하나뿐이다 (L-09)', () => {
    const { container } = render(<AppError error={new Error('boom')} reset={vi.fn()} />)

    const emphasized = container.querySelectorAll('[class*="bg-brand"]')
    expect(emphasized).toHaveLength(1)
    expect(emphasized[0]?.textContent).toBe('다시 열기')
  })
})

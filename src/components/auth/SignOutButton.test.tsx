/** @vitest-environment jsdom */
// 세션이 꼬였을 때의 탈출구. 개발자도구 없이 눌러서 빠져나올 수 있어야 한다.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SignOutButton } from './SignOutButton'

afterEach(cleanup)

describe('SignOutButton — 로그아웃 탈출구', () => {
  it('로그아웃 엔드포인트로 POST 하는 폼 버튼이다', () => {
    render(<SignOutButton />)

    const button = screen.getByRole('button', { name: '로그아웃하기' })
    expect(button.getAttribute('type')).toBe('submit')

    const form = button.closest('form')
    expect(form?.getAttribute('action')).toBe('/auth/signout')
    // GET 이면 prefetch·크롤러가 로그아웃을 실행한다
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('post')
  })

  // 자바스크립트에 기대면 세션이 꼬여 화면이 죽었을 때 정작 못 빠져나온다
  it('클라이언트 상태 없이 마크업만으로 동작한다', () => {
    const { container } = render(<SignOutButton />)

    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '로그아웃하기' }).className).toContain('min-h-11')
  })

  it('강조 CTA 를 차지하지 않는다 (L-09)', () => {
    const { container } = render(<SignOutButton />)

    expect(container.querySelectorAll('[class*="bg-foreground"]')).toHaveLength(0)
  })
})

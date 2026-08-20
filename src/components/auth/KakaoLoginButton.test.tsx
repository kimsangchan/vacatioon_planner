/** @vitest-environment jsdom */
// 카카오 로그인 진입점. 메일 OTP 는 그대로 남긴다 — E2E 5개가 Mailpit 으로 자동화돼 있고,
// 카카오 동의 화면은 카카오 도메인이라 자동화가 닿지 않는다.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { KakaoLoginButton } from './KakaoLoginButton'

afterEach(cleanup)

describe('KakaoLoginButton — 카카오로 들어오기', () => {
  // GET 링크였다면 Next 의 prefetch 가 로그인을 미리 실행해 nonce 를 태운다.
  // 폼 POST 라 JS 없이도, 세션이 꼬여 있어도 눌린다 (로그아웃 버튼과 같은 이유)
  it('시작 경로로 폼 POST 한다', () => {
    const { container } = render(<KakaoLoginButton />)
    const form = container.querySelector('form')

    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/auth/kakao/start')
    expect(screen.getByRole('button', { name: /카카오/ })).toBeTruthy()
  })

  // 이 화면의 강조 CTA 는 '인증 코드 받기' 하나다 (L-09). 카카오 브랜드색은 그 규칙 밖의 색이라
  // 눈에 띄면서도 강조를 둘로 만들지 않는다
  it('강조 CTA 자리를 뺏지 않는다', () => {
    const { container } = render(<KakaoLoginButton />)

    expect(container.querySelectorAll('[class*="bg-brand"]')).toHaveLength(0)
  })

  // 클라이언트 상태가 없다 — 눌리면 브라우저가 폼을 보낸다. 실패 안내는 /login 이 한다
  it('상태를 들고 있지 않다', () => {
    const { container } = render(<KakaoLoginButton />)

    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

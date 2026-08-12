/** @vitest-environment jsdom */
// 카카오 로그인 진입점. 메일 OTP 는 그대로 남긴다 — E2E 5개가 Mailpit 으로 자동화돼 있고,
// 카카오 동의 화면은 카카오 도메인이라 자동화가 닿지 않는다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { KakaoLoginButton } from './KakaoLoginButton'

afterEach(cleanup)

function renderButton(signIn = vi.fn().mockResolvedValue(undefined)) {
  render(<KakaoLoginButton signIn={signIn} />)
  return { signIn }
}

const press = () => fireEvent.click(screen.getByRole('button', { name: /카카오/ }))

describe('KakaoLoginButton — 카카오로 들어오기', () => {
  it('누르면 카카오 로그인을 시작한다', () => {
    const { signIn } = renderButton()

    press()

    expect(signIn).toHaveBeenCalledTimes(1)
  })

  // 이 화면의 강조 CTA 는 '인증 코드 받기' 하나다 (L-09). 카카오는 제 브랜드색을 쓰되
  // bg-foreground 를 쓰지 않는다 — 강조가 둘이 되면 어디를 눌러야 할지 흐려진다
  it('강조 CTA 자리를 뺏지 않는다', () => {
    const { container } = render(<KakaoLoginButton signIn={vi.fn()} />)

    expect(container.querySelectorAll('[class*="bg-foreground"]')).toHaveLength(0)
  })

  it('시작하지 못하면 다음 행동이 있는 문구로 알린다 (막다른 에러 금지)', async () => {
    renderButton(vi.fn().mockRejectedValue(new Error('popup blocked')))

    press()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('메일')
  })

  it('두 번 눌러도 한 번만 시작한다', () => {
    const { signIn } = renderButton()

    press()
    press()

    expect(signIn).toHaveBeenCalledTimes(1)
  })
})

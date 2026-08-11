/** @vitest-environment jsdom */
// 왜 로그인 화면에 와 있는지 알려 준다 — 그 설명이 없으면 "눌러도 아무 반응 없음"으로 보인다 (L-06).
// 문구는 사실이어야 한다: 거부된 토큰은 만료된 것이 아니라 못 쓰게 된 것이다.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LoginPage from './page'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

afterEach(cleanup)

async function renderLogin(reason?: string) {
  const element = await LoginPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(reason ? { reason } : {}),
  })
  return render(element)
}

describe('로그인 화면 — 왜 여기 왔는지 알린다', () => {
  it('그냥 들어왔을 때는 사연을 지어내지 않는다', async () => {
    await renderLogin()

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('button', { name: '인증 코드 받기' })).toBeTruthy()
  })

  it('로그아웃하고 왔으면 그렇다고 말한다', async () => {
    await renderLogin('signed-out')

    expect(screen.getByRole('status').textContent).toBe(
      '로그아웃했어요. 메일 주소를 넣으면 다시 들어와요.',
    )
  })

  // '만료됐어요'는 사실이 아니다 — 시계가 어긋나 발급 시각이 미래로 찍혀도 여기로 온다
  it('로그인 정보가 정리됐으면 만료라고 말하지 않는다', async () => {
    await renderLogin('session-ended')

    const notice = screen.getByRole('status').textContent ?? ''
    expect(notice).toContain('이 기기의 로그인 정보를 더 쓸 수 없어서 정리했어요')
    expect(notice).toContain('메일 주소를 넣으면 바로 다시 들어와요')
    expect(notice).not.toContain('만료')
  })

  // 주소창은 사용자가 무엇이든 적을 수 있는 자리다. 평범한 객체로 조회하면 상속 키가
  // **함수**를 돌려주고 React 가 그걸 렌더하려다 500 으로 죽는다 (실측: ?reason=toString → 500)
  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    '상속 키(%s)를 사연으로 착각하지 않는다',
    async (reason) => {
      render(await LoginPage({ searchParams: Promise.resolve({ reason }) } as never))

      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.getByRole('heading', { name: '여행 캔버스에 들어가요' })).toBeTruthy()
    },
  )

  it('모르는 이유는 조용히 무시한다', async () => {
    await renderLogin('무언가')

    expect(screen.queryByRole('status')).toBeNull()
  })
})

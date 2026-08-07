import { describe, expect, it } from 'vitest'
import { isProtectedPath, LOGIN_PATH } from './session'

describe('isProtectedPath — 미인증 접근을 /login 으로 돌릴 경로 (SPEC §인증)', () => {
  it('protects the trip list and the canvas', () => {
    expect(isProtectedPath('/')).toBe(true)
    expect(isProtectedPath('/trip/6f5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b23')).toBe(true)
    expect(isProtectedPath('/trip/6f5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b23/edit')).toBe(true)
  })

  it('leaves the login route, the API surface and the shared view open', () => {
    expect(isProtectedPath(LOGIN_PATH)).toBe(false)
    expect(isProtectedPath('/api/place-search')).toBe(false)
    expect(isProtectedPath('/s/2f0a9c')).toBe(false)
  })

  // 메일 링크는 세션이 없는 상태로 도착한다 — 여기서 막으면 링크 로그인이 끊긴다 (E-01)
  it('lets the mail link land on the confirm route', () => {
    expect(isProtectedPath('/auth/confirm')).toBe(false)
  })
})

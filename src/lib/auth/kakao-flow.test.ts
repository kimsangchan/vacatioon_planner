// 카카오 OIDC 왕복의 절차 (결정 #36). 라우트는 배선만 하고 판단은 전부 여기서 한다.

import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { KAKAO_STATE_COOKIE, handleKakaoReturn, sha256Hex, startKakaoAuth } from './kakao-flow'

const CREDS = { clientId: 'rest-key', clientSecret: 'secret', redirectUri: 'http://localhost:3010/auth/kakao' }

const req = (url: string, cookie = '') =>
  new NextRequest(url, { headers: { host: '127.0.0.1:3010', ...(cookie ? { cookie } : {}) } })

function fakeSupabase(signIn = vi.fn().mockResolvedValue({ error: null })): SupabaseClient {
  return { auth: { signInWithIdToken: signIn } } as unknown as SupabaseClient
}

describe('startKakaoAuth — 카카오로 보낸다', () => {
  it('카카오 인가 주소로 303 하고 state·nonce 를 쿠키에 감춘다', async () => {
    const response = await startKakaoAuth(req('http://127.0.0.1:3010/auth/kakao/start'), CREDS)

    expect(response.status).toBe(303)
    const target = new URL(response.headers.get('location') ?? '')
    expect(target.origin).toBe('https://kauth.kakao.com')

    const cookie = response.headers.getSetCookie().find((c) => c.startsWith(KAKAO_STATE_COOKIE))
    expect(cookie).toBeTruthy()
    // 브라우저 스크립트가 읽을 이유가 없다 — 훔쳐가면 요청을 위조할 수 있는 값이다
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=lax')
    expect(cookie).toContain('Path=/')
  })

  it('카카오에는 nonce 해시를, 쿠키에는 원문을 둔다', async () => {
    const response = await startKakaoAuth(req('http://127.0.0.1:3010/auth/kakao/start'), CREDS)
    const target = new URL(response.headers.get('location') ?? '')
    const raw = response.headers.getSetCookie()[0].split(';')[0].split('=')[1]
    const saved = JSON.parse(decodeURIComponent(raw))

    expect(target.searchParams.get('state')).toBe(saved.state)
    // GoTrue 가 우리 nonce 를 해시해 토큰 값과 대조한다 — 평문을 보내면 "Nonces mismatch" (실측)
    expect(target.searchParams.get('nonce')).toBe(await sha256Hex(saved.nonce))
    expect(target.searchParams.get('nonce')).not.toBe(saved.nonce)
  })

  it('매번 다른 값을 쓴다 — 재사용되면 위조를 막지 못한다', async () => {
    const a = new URL((await startKakaoAuth(req('http://127.0.0.1:3010/auth/kakao/start'), CREDS)).headers.get('location') ?? '')
    const b = new URL((await startKakaoAuth(req('http://127.0.0.1:3010/auth/kakao/start'), CREDS)).headers.get('location') ?? '')

    expect(a.searchParams.get('state')).not.toBe(b.searchParams.get('state'))
  })
})

describe('handleKakaoReturn — 카카오에서 돌아온 자리', () => {
  const cookieOf = (state: string, nonce = 'n-1') =>
    `${KAKAO_STATE_COOKIE}=${encodeURIComponent(JSON.stringify({ state, nonce }))}`

  const okExchange = vi.fn().mockResolvedValue('id-token-abc')

  it('code 를 id_token 으로 바꿔 Supabase 세션을 만든다', async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null })

    const response = await handleKakaoReturn(
      req('http://127.0.0.1:3010/auth/kakao?code=c1&state=s1', cookieOf('s1')),
      { supabase: fakeSupabase(signIn), credentials: CREDS, exchange: okExchange },
    )

    expect(okExchange).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'c1', redirectUri: CREDS.redirectUri }),
      undefined,
    )
    expect(signIn).toHaveBeenCalledWith({ provider: 'kakao', token: 'id-token-abc', nonce: 'n-1' })
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3010/')
  })

  // 남의 요청을 우리 세션으로 바꿔치기하는 걸 막는 유일한 장치다
  it('state 가 다르면 교환하지 않는다', async () => {
    const exchange = vi.fn()

    const response = await handleKakaoReturn(
      req('http://127.0.0.1:3010/auth/kakao?code=c1&state=남의값', cookieOf('내값')),
      { supabase: fakeSupabase(), credentials: CREDS, exchange },
    )

    expect(exchange).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toContain('reason=social-failed')
  })

  it('쿠키가 없으면 교환하지 않는다', async () => {
    const exchange = vi.fn()

    const response = await handleKakaoReturn(
      req('http://127.0.0.1:3010/auth/kakao?code=c1&state=s1'),
      { supabase: fakeSupabase(), credentials: CREDS, exchange },
    )

    expect(exchange).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toContain('reason=social-failed')
  })

  it('사용자가 카카오에서 취소하면 사연 없이 로그인 화면으로', async () => {
    const response = await handleKakaoReturn(
      req('http://127.0.0.1:3010/auth/kakao?error=access_denied&state=s1', cookieOf('s1')),
      { supabase: fakeSupabase(), credentials: CREDS, exchange: vi.fn() },
    )

    expect(response.headers.get('location')).toBe('http://127.0.0.1:3010/login')
  })

  it('교환이 실패해도 막다른 곳으로 보내지 않는다 (L-06)', async () => {
    const response = await handleKakaoReturn(
      req('http://127.0.0.1:3010/auth/kakao?code=c1&state=s1', cookieOf('s1')),
      {
        supabase: fakeSupabase(),
        credentials: CREDS,
        exchange: vi.fn().mockRejectedValue(new Error('boom')),
      },
    )

    expect(response.headers.get('location')).toContain('reason=social-failed')
  })

  // 한 번 쓴 state 를 남겨 두면 재사용될 수 있다
  it('끝나면 state 쿠키를 지운다', async () => {
    const response = await handleKakaoReturn(
      req('http://127.0.0.1:3010/auth/kakao?code=c1&state=s1', cookieOf('s1')),
      { supabase: fakeSupabase(), credentials: CREDS, exchange: okExchange },
    )

    const cleared = response.headers.getSetCookie().find((c) => c.startsWith(KAKAO_STATE_COOKIE))
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/)
  })
})

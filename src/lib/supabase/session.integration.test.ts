// 로컬 Supabase(`npx supabase start`) 필요. 목이 아니라 @supabase/ssr·GoTrue 의 실제 거동을 못박는다.
//
// 단위 테스트는 "우리가 error 를 어떻게 다루는가"만 본다. 여기서는 라이브러리가 정말로
// (a) 거부된 토큰을 스스로 지우지 않아서 우리 삭제가 필요하고
// (b) 멀쩡한 세션에는 우리 삭제가 끼어들지 않는지를 확인한다.

import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { authCookieKey, updateSession } from './session'
import { SUPABASE_URL, signInWithOtpCode, uniqueTestEmail } from '@/test-support/supabase-local'

const AUTH_COOKIE = authCookieKey(SUPABASE_URL)

function sessionCookie(session: unknown): string {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

function requestWith(cookieValue: string): NextRequest {
  return new NextRequest('http://127.0.0.1:3010/trip/6f5a2f6c-1a5f-4f3a-9d0b-2c9f7f0a1b23', {
    headers: { cookie: `${AUTH_COOKIE}=${cookieValue}` },
  })
}

function expiredNames(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((header) => /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(header))
    .map((header) => header.split('=')[0])
}

describe('updateSession — 실제 Supabase 상대 (integration)', () => {
  it('서버가 거부한 토큰을 응답에서 지운다 — 지우지 않으면 다음 요청도 같은 307 이다', async () => {
    // 형태는 멀쩡하고 서명만 가짜인 토큰. GoTrue 는 bad_jwt 로 답하고 @supabase/ssr 은 쿠키를 남긴다
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(
      JSON.stringify({
        sub: '00000000-0000-0000-0000-000000000000',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url')

    const response = await updateSession(
      requestWith(
        sessionCookie({
          access_token: `${header}.${payload}.bogus-signature`,
          refresh_token: 'bogus-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: '00000000-0000-0000-0000-000000000000' },
        }),
      ),
    )

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location') ?? '').search).toBe('?reason=session-ended')
    expect(expiredNames(response)).toContain(AUTH_COOKIE)
  })

  it('읽을 수조차 없는 쿠키도 지운다 (그냥 두면 영원히 튕긴다)', async () => {
    const response = await updateSession(requestWith('totally-not-a-session'))

    expect(response.status).toBe(307)
    expect(expiredNames(response)).toContain(AUTH_COOKIE)
  })

  it('멀쩡한 세션은 통과시키고 쿠키를 건드리지 않는다', async () => {
    const client = await signInWithOtpCode(uniqueTestEmail('session-keep'))
    const {
      data: { session },
    } = await client.auth.getSession()
    expect(session).not.toBeNull()

    const response = await updateSession(requestWith(sessionCookie(session)))

    expect(response.status).toBe(200)
    expect(expiredNames(response)).not.toContain(AUTH_COOKIE)
  })
})

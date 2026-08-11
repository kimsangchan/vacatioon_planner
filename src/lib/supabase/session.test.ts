import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
import {
  authCookieKey,
  isAuthCookieName,
  isProtectedPath,
  isRejectedSession,
  LOGIN_PATH,
  updateSession,
} from './session'

// updateSession 의 유일한 외부 경계. 쿠키 판정은 우리 코드가 하므로 여기서 끊어도 계약이 남는다.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser } }),
}))

const AUTH_COOKIE = 'sb-127-auth-token'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-for-tests')
  getUser.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function requestFor(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(
    `http://127.0.0.1:3010${pathname}`,
    cookie ? { headers: { cookie } } : undefined,
  )
}

function locationOf(response: { headers: Headers }): string {
  const location = response.headers.get('location') ?? ''
  const url = new URL(location)
  return `${url.pathname}${url.search}`
}

function expiredCookieNames(setCookie: string[]): string[] {
  return setCookie
    .filter((header) => /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(header))
    .map((header) => header.split('=')[0])
}

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

  // 로그아웃은 세션이 거부된 상태에서 눌린다 — 막으면 탈출구가 /login 으로 튕겨 실행되지 않는다
  it('lets the sign-out endpoint run without a usable session', () => {
    expect(isProtectedPath('/auth/signout')).toBe(false)
  })
})

describe('authCookieKey — @supabase/ssr 이 실제로 쓰는 쿠키 이름', () => {
  // supabase-js 의 기본 storageKey 규칙: sb-<hostname 첫 마디>-auth-token
  it('derives the key from the Supabase URL host', () => {
    expect(authCookieKey('http://127.0.0.1:54321')).toBe(AUTH_COOKIE)
    expect(authCookieKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token')
  })

  it('matches the chunks and the derived keys, and nothing else', () => {
    expect(isAuthCookieName(AUTH_COOKIE, AUTH_COOKIE)).toBe(true)
    expect(isAuthCookieName(`${AUTH_COOKIE}.0`, AUTH_COOKIE)).toBe(true)
    expect(isAuthCookieName(`${AUTH_COOKIE}.1`, AUTH_COOKIE)).toBe(true)
    expect(isAuthCookieName(`${AUTH_COOKIE}-code-verifier`, AUTH_COOKIE)).toBe(true)
    expect(isAuthCookieName(`${AUTH_COOKIE}-user`, AUTH_COOKIE)).toBe(true)

    expect(isAuthCookieName('theme', AUTH_COOKIE)).toBe(false)
    expect(isAuthCookieName('sb-other-auth-token', AUTH_COOKIE)).toBe(false)
  })
})

describe('isRejectedSession — 토큰이 거부된 것과 서버에 닿지 못한 것을 가른다', () => {
  it('treats an answer from the auth server as a rejection', () => {
    expect(isRejectedSession(new AuthApiError('invalid JWT', 403, 'bad_jwt'))).toBe(true)
    expect(isRejectedSession(new AuthSessionMissingError())).toBe(true)
  })

  // 여기서 지우면 Supabase 가 잠깐 멈춘 동안 멀쩡한 사용자가 전부 로그아웃된다
  it('never treats a failure to reach the auth server as a rejection', () => {
    expect(isRejectedSession(new AuthRetryableFetchError('fetch failed', 0))).toBe(false)
    expect(isRejectedSession(new AuthRetryableFetchError('gateway', 503))).toBe(false)
  })

  it('has nothing to reject when the call succeeded', () => {
    expect(isRejectedSession(null)).toBe(false)
    expect(isRejectedSession(undefined)).toBe(false)
  })
})

describe('updateSession — 거부된 토큰은 응답에서 지운다 (그러지 않으면 307 이 반복된다)', () => {
  it('expires the auth cookie and its chunks on the way to /login', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('invalid JWT', 403, 'bad_jwt'),
    })

    const response = await updateSession(
      requestFor('/trip/abc', `${AUTH_COOKIE}.0=base64-part; ${AUTH_COOKIE}.1=rest; theme=dark`),
    )

    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe('/login?reason=session-ended')

    const expired = expiredCookieNames(response.headers.getSetCookie())
    expect(expired).toContain(`${AUTH_COOKIE}.0`)
    expect(expired).toContain(`${AUTH_COOKIE}.1`)
    expect(expired).not.toContain('theme')
  })

  it('sends the delete with the scope @supabase/ssr used, or the browser keeps the cookie', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('invalid JWT', 403, 'bad_jwt'),
    })

    const response = await updateSession(requestFor('/', `${AUTH_COOKIE}=base64-broken`))
    const header = response.headers.getSetCookie().find((line) => line.startsWith(AUTH_COOKIE))

    expect(header).toContain('Path=/')
    expect(header).toContain('SameSite=lax')
    expect(header).toContain('Max-Age=0')
    // Max-Age 만으로는 부족하다: Next 가 Set-Cookie 를 다시 파싱할 때 falsy 인 maxAge 를 떨군다
    // (@edge-runtime/cookies 의 compact()) — 실제 응답에서 Max-Age=0 이 사라지는 것을 확인했다
    expect(header).toContain('Expires=Thu, 01 Jan 1970')
  })

  // /auth/confirm 은 낡은 쿠키를 든 채 도착해 **새 세션을 심는** 자리다. 여기서 삭제가 끼면
  // 방금 만든 세션이 지워져 로그인이 영영 안 끝난다 — 게이트가 이걸 막는 유일한 장치다
  it('never clears cookies on the auth callback path', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('invalid JWT', 403, 'bad_jwt'),
    })

    const response = await updateSession(
      requestFor('/auth/confirm?token_hash=abc&type=email', `${AUTH_COOKIE}=base64-old`),
    )

    expect(response.headers.getSetCookie()).toHaveLength(0)
    expect(response.status).toBe(200)
  })

  // 쿠키가 애초에 없던 첫 방문자에게 "정리했어요" 라고 말하면 사실이 아니다
  it('does not claim to have cleared anything when the visitor had no cookie', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() })

    const response = await updateSession(requestFor('/'))

    expect(response.status).toBe(307)
    expect(locationOf(response)).toBe('/login')
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  // Supabase 가 잠깐 멈춘 것뿐이면 토큰은 멀쩡하다 — 지우면 애먼 사람이 로그아웃된다
  it('keeps the cookie when the auth server could not be reached', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('fetch failed', 0),
    })

    const response = await updateSession(requestFor('/trip/abc', `${AUTH_COOKIE}=base64-fine`))

    expect(response.status).toBe(307)
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it('leaves a signed-in visitor alone', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })

    const response = await updateSession(requestFor('/trip/abc', `${AUTH_COOKIE}=base64-fine`))

    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })
})

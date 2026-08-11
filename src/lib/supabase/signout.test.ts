import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleSignOut, signOutClient } from './signout'

interface CookieAdapter {
  getAll: () => { name: string; value: string }[]
  setAll: (cookies: { name: string; value: string; options?: unknown }[]) => void
}

// @supabase/ssr 의 export 는 재정의할 수 없어(ESM) spyOn 이 안 통한다 — 모듈째 가로챈다
let lastAdapter: CookieAdapter | null = null
vi.mock('@supabase/ssr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/ssr')>()
  return {
    ...actual,
    createServerClient: (_url: string, _key: string, options: { cookies: CookieAdapter }) => {
      lastAdapter = options.cookies
      return { auth: { signOut: vi.fn() } }
    },
  }
})

const AUTH_COOKIE = 'sb-127-auth-token'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-for-tests')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// 실제 요청에는 항상 Host 가 있다 — 없는 것처럼 꾸미면 되돌려보낼 주소를 못 짓는다
function signOutRequest(cookie: string): NextRequest {
  return new NextRequest('http://127.0.0.1:3010/auth/signout', {
    method: 'POST',
    headers: { cookie, host: '127.0.0.1:3010' },
  })
}

function expiredCookieNames(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((header) => /Max-Age=0|Expires=Thu, 01 Jan 1970/.test(header))
    .map((header) => header.split('=')[0])
}

function fakeClient(signOut: (options?: unknown) => Promise<unknown>): SupabaseClient {
  return { auth: { signOut } } as unknown as SupabaseClient
}

// signOutClient 가 @supabase/ssr 에 넘긴 쿠키 어댑터를 그대로 꺼낸다
function captureCookieAdapter(request: NextRequest): CookieAdapter {
  lastAdapter = null
  signOutClient(request)

  if (lastAdapter === null) throw new Error('createServerClient 가 불리지 않았어요')
  return lastAdapter
}

// next/headers 의 cookies() 는 요청 스코프 밖에서 던진다 — 여기서 만들어진다는 것 자체가
// 이 클라이언트가 그걸 쓰지 않는다는 증거다.
describe('signOutClient — 응답 쿠키에 손대지 않는 클라이언트', () => {
  it('요청 쿠키만 읽어 만들어진다', () => {
    const supabase = signOutClient(signOutRequest(`${AUTH_COOKIE}=base64-session`))

    expect(typeof supabase.auth.signOut).toBe('function')
  })

  // 이 클라이언트가 존재하는 유일한 이유가 "쓰기를 안 한다"는 성질이다. 그 성질이 깨지면
  // Next 가 쿠키 변경을 병합하며 우리 삭제 지시의 Max-Age 를 떨구고, 값만 빈 쿠키가 남는다.
  it('쓰기 어댑터가 아무것도 바꾸지 않는다', async () => {
    const request = signOutRequest(`${AUTH_COOKIE}=base64-session; theme=dark`)
    const before = request.cookies.getAll().map((c) => `${c.name}=${c.value}`)

    const captured = captureCookieAdapter(request)
    expect(captured.getAll().map((c) => `${c.name}=${c.value}`)).toEqual(before)

    captured.setAll([{ name: AUTH_COOKIE, value: 'rewritten', options: { maxAge: 3600 } }])

    // 요청 쿠키도 그대로여야 한다 — 어디에도 쓰지 않는 어댑터다
    expect(request.cookies.getAll().map((c) => `${c.name}=${c.value}`)).toEqual(before)
  })
})

describe('handleSignOut — 세션이 꼬여도 빠져나오는 탈출구 (SPEC §UI 규칙 — 막다른 화면 금지)', () => {
  it('클리어한 뒤 로그인 화면으로 보낸다', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null })

    const response = await handleSignOut(
      signOutRequest(`${AUTH_COOKIE}=base64-session; theme=dark`),
      { supabase: fakeClient(signOut) },
    )

    // 303 이어야 브라우저가 GET 으로 따라간다 — 307 이면 POST 가 /login 에서 재생된다
    expect(response.status).toBe(303)

    // Location 은 **사용자가 접속한 호스트**를 따라야 한다. nextUrl.origin 은 서버 바인드
    // 주소(localhost)라, 폰에서 LAN IP 로 들어온 사용자를 없는 주소로 보낸다
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3010/login?reason=signed-out')

    // scope 를 생략하면 auth-js 기본값 'global' 이라 그 계정의 **모든 기기**가 로그아웃된다.
    // 이 버튼이 약속하는 건 "이 기기에서 나가기"다 (결정 #13 — PWA·Safari 두 세션이 정상)
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(signOut).toHaveBeenCalledTimes(1)
    expect(expiredCookieNames(response)).toContain(AUTH_COOKIE)
    expect(expiredCookieNames(response)).not.toContain('theme')
  })

  // 세션 갱신이 막히면 auth-js 는 저장된 세션을 지우지 않고 그대로 돌아온다 —
  // signOut 성공에 기대면 정작 꼬였을 때 못 빠져나온다
  it('signOut 이 실패해도 쿠키를 지우고 로그인 화면으로 보낸다', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('fetch failed'))

    const response = await handleSignOut(signOutRequest(`${AUTH_COOKIE}=base64-broken`), {
      supabase: fakeClient(signOut),
    })

    expect(response.status).toBe(303)
    expect(expiredCookieNames(response)).toContain(AUTH_COOKIE)
  })

  // 폰에서 LAN IP 로 들어온 사용자가 localhost 로 튕기면 탈출구가 연결 실패로 끝난다
  it('사용자가 접속한 호스트로 되돌려보낸다', async () => {
    const request = new NextRequest('http://127.0.0.1:3010/auth/signout', {
      method: 'POST',
      headers: { cookie: `${AUTH_COOKIE}=x`, host: '192.168.0.5:3010' },
    })

    const response = await handleSignOut(request, {
      supabase: fakeClient(vi.fn().mockResolvedValue({ error: null })),
    })

    expect(response.headers.get('location')).toBe(
      'http://192.168.0.5:3010/login?reason=signed-out',
    )
  })

  it('프록시 뒤에서는 x-forwarded-proto 를 따른다', async () => {
    const request = new NextRequest('http://127.0.0.1:3010/auth/signout', {
      method: 'POST',
      headers: {
        cookie: `${AUTH_COOKIE}=x`,
        host: 'trip.example.com',
        'x-forwarded-proto': 'https',
      },
    })

    const response = await handleSignOut(request, {
      supabase: fakeClient(vi.fn().mockResolvedValue({ error: null })),
    })

    expect(response.headers.get('location')).toBe(
      'https://trip.example.com/login?reason=signed-out',
    )
  })

  it('청크와 PKCE 부산물까지 함께 지운다', async () => {
    const response = await handleSignOut(
      signOutRequest(
        `${AUTH_COOKIE}.0=head; ${AUTH_COOKIE}.1=tail; ${AUTH_COOKIE}-code-verifier=pkce`,
      ),
      { supabase: fakeClient(vi.fn().mockResolvedValue({ error: null })) },
    )

    const expired = expiredCookieNames(response)
    expect(expired).toContain(`${AUTH_COOKIE}.0`)
    expect(expired).toContain(`${AUTH_COOKIE}.1`)
    expect(expired).toContain(`${AUTH_COOKIE}-code-verifier`)
  })
})

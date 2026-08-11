// 세션 갱신 + 미인증 리다이렉트. Next.js 16 은 middleware 를 proxy 로 개명했고 이 모듈은
// 루트의 src/proxy.ts 가 호출한다 (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { supabaseEnv } from './env'

export const LOGIN_PATH = '/login'

// 인증 없이 열리는 표면: 로그인 화면 · 메일 링크 착지점 · Route Handler(자체 401 처리) · 공유 뷰(P2)
const OPEN_PATHS = [LOGIN_PATH]
const OPEN_PREFIXES = ['/auth/', '/api/', '/s/', '/_next/']

export function isProtectedPath(pathname: string): boolean {
  if (OPEN_PATHS.includes(pathname)) return false
  return !OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// supabase-js 의 기본 storageKey 규칙 그대로 — 우리는 cookieOptions.name 을 넘기지 않는다.
// 하드코딩하면 로컬(sb-127-…)과 원격(sb-<ref>-…)이 어긋난다.
export function authCookieKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
}

// 토큰 쿠키 본체 + 길이 초과 청크(`.0` `.1`) + 파생 키(`-code-verifier` `-user`)
export function isAuthCookieName(name: string, key: string): boolean {
  return name === key || name.startsWith(`${key}.`) || name.startsWith(`${key}-`)
}

// 인증 서버가 "이 토큰은 못 쓴다"고 답한 경우만 참. 서버에 닿지 못한 것(AuthRetryableFetchError)은
// 토큰 문제가 아니므로 거짓 — 여기서 참을 주면 Supabase 가 잠깐 멈출 때 모두가 로그아웃된다.
export function isRejectedSession(error: unknown): boolean {
  return error != null && !isAuthRetryableFetchError(error)
}

// 요청에 실제로 실려 온 인증 쿠키만 만료시키고, 만료시킨 게 있으면 참을 준다.
// path·sameSite 는 @supabase/ssr 이 심을 때 쓴 스코프와 같아야 브라우저가 같은 쿠키로 보고 지운다.
// maxAge 와 expires 를 함께 준다 — Next 가 Set-Cookie 를 다시 파싱할 때 falsy 인 maxAge:0 을
// 떨구기 때문에(@edge-runtime/cookies 의 compact()) Max-Age 만 주면 실제 응답에서 사라진다.
export function expireAuthCookies(request: NextRequest, response: NextResponse): boolean {
  const key = authCookieKey(supabaseEnv().url)
  let expired = false

  for (const { name } of request.cookies.getAll()) {
    if (!isAuthCookieName(name, key)) continue
    response.cookies.set(name, '', {
      path: '/',
      sameSite: 'lax',
      maxAge: 0,
      expires: new Date(0),
    })
    expired = true
  }

  return expired
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = supabaseEnv()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        // 세션 쿠키가 실린 응답은 CDN 캐시 금지 (@supabase/ssr 이 넘겨주는 헤더 그대로)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // 응답이 확정되기 전에 호출해야 갱신된 토큰이 쿠키로 나간다 (@supabase/ssr 주의사항)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 거부된 토큰은 여기서 지운다. 남겨 두면 다음 요청도 같은 이유로 튕겨 사용자가 갇힌다 —
  // @supabase/ssr 은 bad_jwt·깨진 쿠키에서는 스스로 지우지 않는다.
  // 게이트를 두는 이유: /auth/confirm 은 낡은 쿠키를 든 채 도착해 새 세션을 심는 자리다.
  const cleared =
    !user &&
    isRejectedSession(error) &&
    (isProtectedPath(pathname) || pathname === LOGIN_PATH) &&
    expireAuthCookies(request, response)

  if (!user && isProtectedPath(pathname)) {
    // 지운 게 있을 때만 사연을 전한다 — 쿠키가 없던 첫 방문자에게는 사실이 아니다
    return redirectTo(LOGIN_PATH, request, response, cleared ? 'session-ended' : undefined)
  }
  if (user && pathname === LOGIN_PATH) return redirectTo('/', request, response)

  return response
}

function redirectTo(
  pathname: string,
  request: NextRequest,
  carried: NextResponse,
  reason?: string,
): NextResponse {
  const target = request.nextUrl.clone()
  target.pathname = pathname
  target.search = reason ? `?reason=${reason}` : ''

  const redirect = NextResponse.redirect(target)
  for (const cookie of carried.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

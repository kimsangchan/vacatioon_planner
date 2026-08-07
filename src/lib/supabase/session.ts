// 세션 갱신 + 미인증 리다이렉트. Next.js 16 은 middleware 를 proxy 로 개명했고 이 모듈은
// 루트의 src/proxy.ts 가 호출한다 (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { supabaseEnv } from './env'

export const LOGIN_PATH = '/login'

// 인증 없이 열리는 표면: 로그인 화면 · 메일 링크 착지점 · Route Handler(자체 401 처리) · 공유 뷰(P2)
const OPEN_PATHS = [LOGIN_PATH]
const OPEN_PREFIXES = ['/auth/', '/api/', '/s/', '/_next/']

export function isProtectedPath(pathname: string): boolean {
  if (OPEN_PATHS.includes(pathname)) return false
  return !OPEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
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
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && isProtectedPath(pathname)) return redirectTo(LOGIN_PATH, request, response)
  if (user && pathname === LOGIN_PATH) return redirectTo('/', request, response)

  return response
}

function redirectTo(pathname: string, request: NextRequest, carried: NextResponse): NextResponse {
  const target = request.nextUrl.clone()
  target.pathname = pathname
  target.search = ''

  const redirect = NextResponse.redirect(target)
  for (const cookie of carried.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

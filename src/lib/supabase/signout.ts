// 로그아웃 절차의 본체. Route Handler(src/app/auth/signout/route.ts)는 요청과 클라이언트만 넘긴다
// (place/search-proxy.ts 와 같은 형태) — next/headers 를 쓰는 route.ts 는 테스트에서 부를 수 없다.
//
// 이 경로의 존재 이유는 "세션이 꼬였을 때 빠져나오는 것"이다. 그래서 signOut 의 성공에 기대지 않고
// 쿠키를 직접 만료시킨다 — auth-js 는 세션 조회가 실패하면 저장된 세션을 남긴 채 돌아온다.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from './env'
import { appRedirectTarget } from './redirect'
import { expireAuthCookies, LOGIN_PATH } from './session'

export interface SignOutDeps {
  supabase: SupabaseClient
}

// 여기서만 next/headers 대신 요청 쿠키를 직접 읽는 클라이언트를 쓴다.
// server.ts 의 클라이언트(next/headers)로 signOut 하면 Next 가 그 쿠키 변경을 응답에 병합하면서
// 우리 삭제 지시의 Max-Age·Expires 를 떨어뜨린다 — 값만 빈 쿠키가 남아 실제로 지워지지 않는다.
// (실측: `sb-…-auth-token=; Path=/; SameSite=lax`) 쓰기를 막으면 응답은 우리 것만 남는다.
export function signOutClient(request: NextRequest): SupabaseClient {
  const { url, anonKey } = supabaseEnv()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: () => {},
    },
  })
}

export async function handleSignOut(
  request: NextRequest,
  { supabase }: SignOutDeps,
): Promise<NextResponse> {
  // 서버 쪽 세션도 끊어 준다. 실패는 삼킨다 — 쿠키 삭제가 진짜 탈출구다.
  //
  // scope 를 반드시 명시한다: auth-js 의 기본값은 'global' 이라 인자를 생략하면 그 계정의
  // **모든 기기** refresh token 이 폐기된다. 이 버튼이 약속하는 건 "이 기기에서 나가기"이고
  // (결정 #13 대로 한 사람이 PWA·Safari 두 세션을 갖는 게 정상이다), 하필 이 버튼이 놓인
  // 자리가 에러 화면이라 한 표면만 깨진 사람이 나머지 세션까지 잃는다.
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // 무시한다
  }

  const response = new NextResponse(null, {
    // 303 이어야 브라우저가 GET 으로 따라간다 — 307 이면 이 POST 가 /login 에서 재생된다
    status: 303,
    headers: { Location: appRedirectTarget(request, `${LOGIN_PATH}?reason=signed-out`) },
  })
  expireAuthCookies(request, response)

  return response
}

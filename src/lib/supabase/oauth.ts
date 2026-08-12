// 소셜 로그인(카카오) 착지점의 절차 본체. Route Handler(src/app/auth/callback/route.ts)는
// 요청과 클라이언트만 넘긴다 (place/search-proxy.ts 와 같은 형태).
//
// 카카오는 우리 앱이 아니라 **Supabase** 로 되돌려보낸다(등록된 Redirect URI 는
// <supabase>/auth/v1/callback 하나뿐이다). Supabase 가 다시 여기로 `code` 를 실어 보내고,
// 그 code 를 세션으로 바꾸는 게 이 파일의 일이다.
//
// 메일 링크(/auth/confirm)와 섞지 않는다 — 그쪽은 token_hash 를 verifyOtp 로 푸는 다른 절차다.

import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appRedirectTarget } from './redirect'
import { LOGIN_PATH } from './session'

export interface OAuthCallbackDeps {
  supabase: SupabaseClient
}

export async function handleOAuthCallback(
  request: NextRequest,
  { supabase }: OAuthCallbackDeps,
): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')

  // 카카오 동의 화면에서 "취소"를 누르면 code 없이 error 만 온다. 실패가 아니라 사용자의 선택이니
  // 사연을 붙이지 않는다 — 로그인 화면이 이미 다음 행동을 들고 있다
  if (searchParams.get('error')) {
    return NextResponse.redirect(appRedirectTarget(request, LOGIN_PATH))
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(appRedirectTarget(request, '/'))
  }

  // 막다른 곳으로 보내지 않는다 (L-06) — 로그인 화면에서 메일 코드로 이어 갈 수 있다
  return NextResponse.redirect(appRedirectTarget(request, `${LOGIN_PATH}?reason=social-failed`))
}

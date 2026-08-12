// 카카오에서 돌아오는 자리 (결정 #36). 절차는 lib/auth/kakao-flow.ts 에 있다.
//
// 카카오 콘솔의 Redirect URI 에 이 경로를 등록해야 한다 (http://localhost:3010/auth/kakao).
// /auth/ 는 이미 세션 없이 열리는 표면이라(lib/supabase/session.ts) 로그인 전에도 닿는다.

import { NextResponse, type NextRequest } from 'next/server'
import { handleKakaoReturn, kakaoCredentials } from '@/lib/auth/kakao-flow'
import { appRedirectTarget } from '@/lib/supabase/redirect'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    return await handleKakaoReturn(request, {
      supabase: await createSupabaseServerClient(),
      credentials: kakaoCredentials(request),
    })
  } catch (failure) {
    console.error('[kakao] 콜백 실패', (failure as Error).message)
    return NextResponse.redirect(appRedirectTarget(request, '/login?reason=social-failed'))
  }
}

// 카카오 로그인 시작점 (결정 #36). 절차는 lib/auth/kakao-flow.ts 에 있다.
//
// POST 만 받는다: 링크(GET)로 두면 Next 의 prefetch 가 로그인을 미리 실행해 nonce 를 태운다.
// client_secret 은 이 경계 밖으로 나가지 않는다 — 브라우저는 카카오 주소만 받는다.

import { NextResponse, type NextRequest } from 'next/server'
import { kakaoCredentials, startKakaoAuth } from '@/lib/auth/kakao-flow'
import { appRedirectTarget } from '@/lib/supabase/redirect'

export async function POST(request: NextRequest) {
  try {
    return startKakaoAuth(request, kakaoCredentials(request))
  } catch (failure) {
    console.error('[kakao] 시작 실패', (failure as Error).message)
    // 막다른 곳으로 보내지 않는다 — 로그인 화면에서 메일 코드로 이어 갈 수 있다 (L-06)
    return NextResponse.redirect(appRedirectTarget(request, '/login?reason=social-failed'), 303)
  }
}

// 메일 링크 착지점 (E-01 보조 경로). 기본은 6자리 코드 입력이고, 링크는 같은 세션을
// 서버에서 만들어 준다 — token_hash 를 쓰므로 다른 기기에서 열어도 동작한다 (결정 #13).

import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { appRedirectTarget } from '@/lib/supabase/redirect'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(appRedirectTarget(request, '/'))
  }

  // 실패해도 막다른 곳으로 보내지 않는다 — 로그인 화면에서 코드로 이어서 하면 된다
  return NextResponse.redirect(appRedirectTarget(request, '/login'))
}

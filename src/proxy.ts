// Next.js 16: middleware.ts → proxy.ts 로 파일명·export 명이 바뀌었다 (기능은 동일).
// 근거: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
// 여기서는 Supabase 세션 갱신과 미인증 리다이렉트만 하고, 실제 권한 판정은 RLS 가 한다.

import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/session'

export default async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // manifest·아이콘은 세션 검사에서 뺀다 (결정 #1) — iOS 는 이 주소들을 쿠키 없이 받아 가는데,
  // 여기서 로그인으로 307 을 주면 설치 정보를 못 읽어 홈 화면 추가가 그냥 북마크가 된다 (실측: 307)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}

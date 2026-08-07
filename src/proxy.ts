// Next.js 16: middleware.ts → proxy.ts 로 파일명·export 명이 바뀌었다 (기능은 동일).
// 근거: node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
// 여기서는 Supabase 세션 갱신과 미인증 리다이렉트만 하고, 실제 권한 판정은 RLS 가 한다.

import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/session'

export default async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
}

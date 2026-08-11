// 로그아웃 엔드포인트 (화면 아님 — 항상 303 으로 /login 에 내려놓는다).
// 절차는 lib/supabase/signout.ts 에 있고 여기서는 배선만 한다.
//
// GET 은 만들지 않는다: <Link> 로 이어지는 순간 prefetch 가 로그아웃을 실행한다.
// 부르는 쪽은 <form method="post"> 뿐이어야 한다 (components/auth/SignOutButton.tsx).
// /auth/ 는 이미 세션 없이 열리는 표면이라(lib/supabase/session.ts) 세션이 꼬여도 실행된다.

import type { NextRequest } from 'next/server'
import { handleSignOut, signOutClient } from '@/lib/supabase/signout'

export async function POST(request: NextRequest) {
  return handleSignOut(request, { supabase: signOutClient(request) })
}

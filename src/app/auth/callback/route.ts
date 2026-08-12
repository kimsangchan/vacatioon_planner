// 소셜 로그인 착지점 (카카오 → Supabase → 여기). 절차는 lib/supabase/oauth.ts 에 있고
// 여기서는 배선만 한다 — next/headers 를 쓰는 이 파일은 테스트에서 부를 수 없다.
//
// /auth/ 는 이미 세션 없이 열리는 표면이라(lib/supabase/session.ts) 로그인 전에도 닿는다.

import type { NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/supabase/oauth'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, { supabase: await createSupabaseServerClient() })
}

// E-15 이동시간 프록시 (결정 #45). 절차 본체는 lib/route/directions-proxy.ts —
// 여기서는 요청마다 서버 Supabase 클라이언트를 만들어 넘기는 배선만 한다.
// 길찾기 키는 서버 전용이라 이 파일 경계 밖(클라이언트 번들)으로 나가지 않는다.

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handleDirections } from '@/lib/route/directions-proxy'

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  return handleDirections(request, { supabase })
}

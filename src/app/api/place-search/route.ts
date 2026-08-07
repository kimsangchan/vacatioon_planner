// E-03 네이버 지역 검색 프록시 (SPEC §알고리즘 4). 절차 본체는 lib/place/search-proxy.ts —
// 여기서는 요청마다 서버 Supabase 클라이언트를 만들어 넘기는 배선만 한다.
// 검색 키는 서버 전용이라 이 파일 경계 밖(클라이언트 번들)으로 나가지 않는다.

import type { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handlePlaceSearch } from '@/lib/place/search-proxy'

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  return handlePlaceSearch(request, { supabase })
}

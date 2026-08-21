// 장소 사진 프록시 (결정 #63). 절차 본체는 lib/place/image-proxy.ts —
// 여기서는 요청마다 서버 Supabase 클라이언트를 만들어 넘기는 배선만 한다.

import type { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { handlePlaceImages } from '@/lib/place/image-proxy'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  return handlePlaceImages(request, { supabase })
}

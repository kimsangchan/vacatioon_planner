// 서버 클라이언트 (@supabase/ssr 표준 패턴). 요청마다 새로 만든다 — 절대 재사용하지 않는다.
// anon 키만 쓴다: service role 키는 어떤 런타임 코드에도 등장하지 않는다 (decision-log #11).

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseEnv } from './env'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = supabaseEnv()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Component 에서는 쿠키를 쓸 수 없다 — 토큰 갱신은 proxy.ts 가 책임진다
        }
      },
    },
  })
}

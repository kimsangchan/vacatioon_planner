// 브라우저 클라이언트 (@supabase/ssr 표준 패턴). 쿠키는 라이브러리가 document.cookie 로 직접 다룬다 —
// 같은 쿠키를 server.ts·proxy.ts 가 읽으므로 커스텀 스토리지를 끼우지 않는다.

import { createBrowserClient } from '@supabase/ssr'
import { supabaseEnv } from './env'

export function createSupabaseBrowserClient() {
  const { url, anonKey } = supabaseEnv()
  return createBrowserClient(url, anonKey)
}

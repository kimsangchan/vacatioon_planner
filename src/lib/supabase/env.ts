// 브라우저·서버 클라이언트가 공유하는 환경변수 접근점.
// NEXT_PUBLIC_* 는 빌드 시 인라인되므로 여기서도 리터럴 표기를 유지한다 (SPEC §스택·환경변수).

export interface SupabaseEnv {
  url: string
  anonKey: string
}

export function supabaseEnv(): SupabaseEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_ANON_KEY 가 필요해요 — .env.local 을 확인해 주세요 (tasks.md T0)',
    )
  }

  return { url, anonKey }
}

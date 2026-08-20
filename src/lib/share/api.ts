// 공유 링크 (결정 #3·#46) — 여행을 **읽기 전용**으로 열어 주는 문.
//
// 계정을 요구하지 않는다: 링크를 받은 사람은 로그인 없이 열고, 별표만 남길 수 있다(#46).
// 토큰은 서버가 만든 128bit CSPRNG 다 — 클라이언트가 만들지 않는다 (04 §위협모델).

import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST 가 bytea 를 돌려줄 때 쓰는 접두사. 링크에는 hex 만 싣는다 */
const BYTEA_PREFIX = '\\x'

/** `\x9f2c…` → `9f2c…`. 주소창에 백슬래시가 들어가면 사람이 복사하다 흘린다 */
export function toHex(bytea: string): string {
  return bytea.startsWith(BYTEA_PREFIX) ? bytea.slice(BYTEA_PREFIX.length) : bytea
}

/** hex → `\x9f2c…`. RPC 인자로 되돌릴 때 쓴다 */
export function toBytea(hex: string): string {
  return BYTEA_PREFIX + hex
}

/** 링크가 유효한 모양인지 — 서버에 묻기 전에 걸러 낸다 (16바이트 = hex 32자) */
export function isShareToken(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function shareUrl(origin: string, hex: string): string {
  return `${origin}/s/${hex}`
}

/** 링크를 켠다. 이미 켜져 있어도 **새 토큰**이 나온다 — 다시 켜기가 곧 이전 링크 무효화다 */
export async function enableShare(supabase: SupabaseClient, tripId: string): Promise<string> {
  const { data, error } = await supabase.rpc('enable_share', { trip_id: tripId })
  if (error) throw error
  return toHex(String(data))
}

export async function disableShare(supabase: SupabaseClient, tripId: string): Promise<void> {
  const { error } = await supabase.rpc('disable_share', { trip_id: tripId })
  if (error) throw error
}

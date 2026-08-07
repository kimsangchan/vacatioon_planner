// 로컬 Supabase(`npx supabase start`) 전용 테스트 헬퍼. 앱 코드는 이 파일을 import 하지 않는다.
// service role 키는 쓰지 않는다 — 시드도 로그인한 사용자 권한(RLS)으로 넣는다 (decision-log #11).

import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324'

interface MailpitMessage {
  ID: string
  To: { Address: string }[]
  Created: string
}

// 테스트 유저는 t4-* 네임스페이스 — 로컬 auth.users 에서 식별 가능해야 한다
export function uniqueTestEmail(label: string): string {
  return `t4-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@example.com`
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function mailpit<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`)
  if (!response.ok) throw new Error(`Mailpit ${path} → ${response.status}`)
  return (await response.json()) as T
}

// 메일 본문의 6자리 코드 (SPEC §인증 — 메일 템플릿에 {{ .Token }} 필요)
export async function waitForOtpCode(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { messages } = await mailpit<{ messages: MailpitMessage[] }>('/api/v1/messages?limit=50')
    const mine = messages
      .filter((m) => m.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()))
      .sort((a, b) => b.Created.localeCompare(a.Created))[0]

    if (mine) {
      const detail = await mailpit<{ Text: string; HTML: string }>(`/api/v1/message/${mine.ID}`)
      const code = `${detail.Text}\n${detail.HTML}`.match(/\b(\d{6})\b/)?.[1]
      if (code) return code
      throw new Error(
        `메일에 6자리 코드가 없어요 — supabase/config.toml 의 magic_link 템플릿에 {{ .Token }} 이 필요합니다.\n${detail.Text}`,
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Mailpit 에서 ${email} 앞으로 온 메일을 ${timeoutMs}ms 안에 찾지 못했어요`)
}

// ── 운영 테이블 시드 (테스트 한정) ──────────────────────────────────────────
// api_usage 는 anon·authenticated·service_role 어디에도 GRANT 가 없다 — 유일한 경로가
// SECURITY DEFINER RPC 라 "카운터를 12,500으로 시드"(SC-008)를 RLS 경로로는 만들 수 없다.
// 그래서 여기서만 로컬 postgres 로 직접 넣는다. 런타임 코드는 이 경로를 쓰지 않는다 (결정 #11).

const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_trip-canvas'

function psql(sql: string): void {
  execFileSync(
    'docker',
    ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { stdio: 'pipe' },
  )
}

function assertCounter(counter: string): void {
  if (!/^[a-z_]+$/.test(counter)) throw new Error(`counter 이름이 이상해요: ${counter}`)
}

export function seedApiUsage(counter: string, count: number): void {
  assertCounter(counter)
  psql(
    `insert into public.api_usage (date, counter, count) values (current_date, '${counter}', ${Math.trunc(count)})
     on conflict (date, counter) do update set count = excluded.count`,
  )
}

export function clearApiUsage(counter: string): void {
  assertCounter(counter)
  psql(`delete from public.api_usage where date = current_date and counter = '${counter}'`)
}

// signInWithOtp → 코드 추출 → verifyOtp. 세션이 붙은 클라이언트를 돌려준다 (E-01)
export async function signInWithOtpCode(email: string): Promise<SupabaseClient> {
  const client = anonClient()
  const { error: otpError } = await client.auth.signInWithOtp({ email })
  if (otpError) throw otpError

  const token = await waitForOtpCode(email)
  const { error: verifyError } = await client.auth.verifyOtp({ email, token, type: 'email' })
  if (verifyError) throw verifyError

  return client
}

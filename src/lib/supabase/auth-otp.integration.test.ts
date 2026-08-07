// FR-001 (docs/design/06 변환표) — 로컬 Supabase + Mailpit 대상 integration.
// 매직링크가 아니라 6자리 코드가 기본 플로우다 (decision-log #13 — iOS 설치형 PWA 세션 격리).

import { describe, expect, it } from 'vitest'
import { anonClient, uniqueTestEmail, waitForOtpCode } from '@/test-support/supabase-local'

describe('E-01 signInWithOtp → verifyOtp', () => {
  it('creates a session from the 6-digit code in the mailbox', async () => {
    const email = uniqueTestEmail('otp')
    const client = anonClient()

    const { error: otpError } = await client.auth.signInWithOtp({ email })
    expect(otpError).toBeNull()

    const token = await waitForOtpCode(email)
    expect(token).toMatch(/^\d{6}$/)

    const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
    expect(error).toBeNull()
    expect(data.session?.access_token).toBeTruthy()
    expect(data.user?.email).toBe(email)
  }, 30_000)

  it('rejects a wrong code without creating a session', async () => {
    const email = uniqueTestEmail('otp-bad')
    const client = anonClient()

    const { error: otpError } = await client.auth.signInWithOtp({ email })
    expect(otpError).toBeNull()
    await waitForOtpCode(email)

    const { data, error } = await client.auth.verifyOtp({ email, token: '000000', type: 'email' })
    expect(error).not.toBeNull()
    expect(data.session).toBeNull()
  }, 30_000)
})

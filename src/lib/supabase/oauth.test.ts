// 소셜 로그인(카카오) 착지점. 카카오 → Supabase → 여기로 `code` 가 실려 온다.
// 메일 링크(/auth/confirm)는 token_hash 를 verifyOtp 로 푸는 다른 절차라 섞지 않는다.

import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleOAuthCallback } from './oauth'

function callbackRequest(query: string, host = '127.0.0.1:3010'): NextRequest {
  return new NextRequest(`http://127.0.0.1:3010/auth/callback${query}`, { headers: { host } })
}

function fakeClient(exchange: (code: string) => Promise<{ error: unknown }>): SupabaseClient {
  return { auth: { exchangeCodeForSession: exchange } } as unknown as SupabaseClient
}

const ok = () => vi.fn().mockResolvedValue({ error: null })

describe('handleOAuthCallback — 카카오에서 돌아온 자리', () => {
  it('code 를 세션으로 바꾸고 여행 목록으로 보낸다', async () => {
    const exchange = ok()

    const response = await handleOAuthCallback(callbackRequest('?code=auth-code-123'), {
      supabase: fakeClient(exchange),
    })

    expect(exchange).toHaveBeenCalledWith('auth-code-123')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3010/')
  })

  // 사용자가 접속한 호스트를 따라야 한다 — 폰에서 들어왔는데 localhost 로 보내면 갇힌다
  it('사용자가 접속한 호스트로 되돌려보낸다', async () => {
    const response = await handleOAuthCallback(
      callbackRequest('?code=auth-code-123', '192.168.0.5:3010'),
      { supabase: fakeClient(ok()) },
    )

    expect(response.headers.get('location')).toBe('http://192.168.0.5:3010/')
  })

  // 막다른 곳으로 보내지 않는다 (L-06) — 로그인 화면에서 메일 코드로 이어 갈 수 있다
  it('code 가 없으면 로그인 화면에서 이유를 알린다', async () => {
    const exchange = ok()

    const response = await handleOAuthCallback(callbackRequest(''), {
      supabase: fakeClient(exchange),
    })

    expect(exchange).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3010/login?reason=social-failed',
    )
  })

  it('교환이 실패해도 로그인 화면으로 보낸다', async () => {
    const response = await handleOAuthCallback(callbackRequest('?code=stale'), {
      supabase: fakeClient(vi.fn().mockResolvedValue({ error: new Error('invalid code') })),
    })

    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3010/login?reason=social-failed',
    )
  })

  // 사용자가 카카오 화면에서 "취소"를 누르면 error 만 실려 온다 — 실패로 취급하되 조용히 보낸다
  it('사용자가 카카오에서 취소하면 그냥 로그인 화면으로 돌린다', async () => {
    const exchange = ok()

    const response = await handleOAuthCallback(
      callbackRequest('?error=access_denied&error_description=cancelled'),
      { supabase: fakeClient(exchange) },
    )

    expect(exchange).not.toHaveBeenCalled()
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3010/login')
  })
})

// 카카오를 직접 부르는 OIDC 경로 (결정 #36).
//
// 왜 Supabase 의 authorize 를 안 쓰나: GoTrue 는 카카오에 대해 scope 를 고정으로 넣는다
// (`account_email profile_image profile_nickname`). 이메일 동의항목은 비즈 앱 전환 + 심사를
// 통과해야 설정할 수 있는데, **설정되지 않은 항목을 요청하면 카카오가 인가를 거절한다.**
// 카카오의 안내도 "설정하지 않은 동의 항목을 제외하고 재요청"이다 — 그러려면 우리가 직접 불러야 한다.

import { describe, expect, it, vi } from 'vitest'
import { exchangeKakaoCode, kakaoAuthorizeUrl, KAKAO_OIDC_SCOPES } from './kakao'

const CREDS = {
  clientId: 'rest-api-key',
  clientSecret: 'client-secret',
  redirectUri: 'http://localhost:3010/auth/kakao',
}

describe('kakaoAuthorizeUrl — 카카오에 보낼 주소', () => {
  const url = new URL(
    kakaoAuthorizeUrl({ ...CREDS, state: 'state-123', nonce: 'nonce-456' }),
  )

  it('카카오 인가 엔드포인트로 간다', () => {
    expect(url.origin + url.pathname).toBe('https://kauth.kakao.com/oauth/authorize')
  })

  // 이 두 줄이 이 파일의 존재 이유다 — 이메일이 끼면 카카오가 인가를 거절한다
  it('이메일을 요청하지 않는다', () => {
    expect(url.searchParams.get('scope')).toBe(KAKAO_OIDC_SCOPES)
    expect(url.searchParams.get('scope')).not.toContain('account_email')
  })

  // 앱은 닉네임도 프로필 사진도 쓰지 않는다 — 화면에 사용자 이름이 나오는 자리가 없다.
  // openid 하나면 sub(고유 식별자)가 오고 그걸로 소유권이 성립한다 (auth.uid())
  it('식별에 필요한 openid 만 요청한다 — 그 이상 받지 않는다', () => {
    expect(url.searchParams.get('scope')).toBe('openid')
    expect(url.searchParams.get('scope')).not.toContain('profile')
  })

  it('code 흐름으로 state·nonce 를 실어 보낸다', () => {
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe(CREDS.clientId)
    expect(url.searchParams.get('redirect_uri')).toBe(CREDS.redirectUri)
    expect(url.searchParams.get('state')).toBe('state-123')
    expect(url.searchParams.get('nonce')).toBe('nonce-456')
  })

  it('비밀은 절대 주소에 싣지 않는다 — 브라우저가 보는 주소다', () => {
    expect(url.toString()).not.toContain(CREDS.clientSecret)
  })
})

describe('exchangeKakaoCode — code 를 id_token 으로', () => {
  const tokenResponse = (body: unknown, status = 200) =>
    vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )

  it('토큰 엔드포인트에 폼으로 보내고 id_token 을 돌려준다', async () => {
    const fetchImpl = tokenResponse({ id_token: 'the-id-token', access_token: 'a' })

    const idToken = await exchangeKakaoCode({ ...CREDS, code: 'auth-code' }, fetchImpl)

    expect(idToken).toBe('the-id-token')

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://kauth.kakao.com/oauth/token')
    expect(init?.method).toBe('POST')

    const sent = new URLSearchParams(init?.body as string)
    expect(sent.get('grant_type')).toBe('authorization_code')
    expect(sent.get('code')).toBe('auth-code')
    expect(sent.get('client_id')).toBe(CREDS.clientId)
    expect(sent.get('client_secret')).toBe(CREDS.clientSecret)
    expect(sent.get('redirect_uri')).toBe(CREDS.redirectUri)
  })

  it('id_token 이 없으면 실패로 본다 — OpenID Connect 가 꺼져 있으면 이렇게 온다', async () => {
    const fetchImpl = tokenResponse({ access_token: 'only-access' })

    await expect(exchangeKakaoCode({ ...CREDS, code: 'c' }, fetchImpl)).rejects.toThrow()
  })

  it('카카오가 거절하면 실패로 본다', async () => {
    const fetchImpl = tokenResponse({ error: 'invalid_grant' }, 400)

    await expect(exchangeKakaoCode({ ...CREDS, code: 'c' }, fetchImpl)).rejects.toThrow()
  })

  // 실패 메시지가 그대로 화면에 나가면 비밀이 샌다 (05 §규약 — 원문 미노출)
  it('실패해도 비밀을 메시지에 담지 않는다', async () => {
    const fetchImpl = tokenResponse({ error: 'invalid_client', client_secret: CREDS.clientSecret }, 401)

    await expect(exchangeKakaoCode({ ...CREDS, code: 'c' }, fetchImpl)).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining(CREDS.clientSecret) }),
    )
  })
})

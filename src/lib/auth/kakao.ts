// 카카오를 직접 부르는 OIDC 경로 (결정 #36).
//
// 왜 Supabase 의 authorize(/auth/v1/authorize?provider=kakao)를 안 쓰나:
// GoTrue 는 카카오 scope 를 `account_email profile_image profile_nickname` 으로 고정한다
// (`scopes` 옵션을 줘도 교체가 아니라 **덧붙는다** — 실측 확인). 그런데 이메일 동의항목은
// 비즈 앱 전환 + 심사(영업일 3~5일)를 통과해야 설정할 수 있고, **설정되지 않은 항목을 요청하면
// 카카오가 인가 자체를 거절한다.** 카카오의 안내도 "설정하지 않은 동의 항목을 제외하고 재요청"이다.
//
// 그래서 우리가 카카오와 직접 이야기해 id_token 만 받고, 그 증명을 Supabase 에 건넨다
// (signInWithIdToken). 세션은 여전히 Supabase 가 발급한다 — RLS 가 auth.uid() 로 잠겨 있으니
// 로그인은 반드시 Supabase 세션으로 끝나야 한다.
//
// 요청 범위는 `openid` 하나다. 앱에 사용자 이름이 나오는 자리가 없어 닉네임도 필요 없다 —
// sub(고유 식별자)만 있으면 소유권이 성립한다. 안 쓰는 개인정보는 받지 않는다.

export const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize'
export const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
export const KAKAO_OIDC_SCOPES = 'openid'

export interface KakaoAuthorizeInput {
  clientId: string
  redirectUri: string
  state: string
  nonce: string
}

export function kakaoAuthorizeUrl(input: KakaoAuthorizeInput): string {
  const url = new URL(KAKAO_AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: KAKAO_OIDC_SCOPES,
    state: input.state,
    // id_token 에 실려 돌아온다 — 우리가 시작한 요청인지 확인하는 값
    nonce: input.nonce,
  }).toString()
  return url.toString()
}

export interface KakaoExchangeInput {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

export class KakaoAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KakaoAuthError'
  }
}

/** code → id_token. 실패 메시지에 비밀이나 응답 원문을 담지 않는다 (05 §규약) */
export async function exchangeKakaoCode(
  input: KakaoExchangeInput,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  })

  const response = await fetchImpl(KAKAO_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString(),
    cache: 'no-store',
  })

  if (!response.ok) {
    // 상태 코드만 남긴다 — 응답 본문에는 우리가 보낸 값이 그대로 되돌아오기도 한다
    throw new KakaoAuthError(`카카오 토큰 교환 실패 (${response.status})`)
  }

  const payload = (await response.json().catch(() => null)) as { id_token?: unknown } | null
  const idToken = payload?.id_token

  if (typeof idToken !== 'string' || idToken === '') {
    // 카카오 콘솔에서 OpenID Connect 를 켜지 않으면 access_token 만 오고 id_token 이 없다
    throw new KakaoAuthError('id_token 이 없어요 — 카카오 콘솔의 OpenID Connect 를 켜 주세요')
  }

  return idToken
}

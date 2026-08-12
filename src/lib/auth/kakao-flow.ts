// 카카오 OIDC 왕복의 절차 (결정 #36). Route Handler 는 배선만 하고 판단은 전부 여기서 한다.
//
//   /auth/kakao/start  → state·nonce 를 만들어 쿠키에 감추고 카카오로 302
//   /auth/kakao        → state 확인 → code 를 id_token 으로 교환 → Supabase 세션 발급
//
// 세션은 여전히 Supabase 가 발급한다 — 데이터가 RLS(auth.uid())로 잠겨 있어서 로그인은
// 반드시 Supabase 세션으로 끝나야 한다. 카카오는 "이 사람이 맞다"는 증명만 해준다.

import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appRedirectTarget } from '@/lib/supabase/redirect'
import { LOGIN_PATH } from '@/lib/supabase/session'
import { exchangeKakaoCode, kakaoAuthorizeUrl } from './kakao'

export const KAKAO_STATE_COOKIE = 'kakao-auth-state'

export interface KakaoCredentials {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** 서버 전용 — client_secret 이 브라우저로 나가면 안 된다 (SPEC §스택·환경변수) */
export function kakaoCredentials(request: NextRequest): KakaoCredentials {
  const clientId = process.env.KAKAO_REST_API_KEY
  const clientSecret = process.env.KAKAO_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('KAKAO_REST_API_KEY·KAKAO_CLIENT_SECRET 이 필요해요 — .env 를 확인해 주세요')
  }

  // 카카오 콘솔에 등록한 Redirect URI 와 **글자까지** 같아야 한다.
  // 사용자가 접속한 호스트를 따른다 — 폰에서 LAN IP 로 들어오면 그 주소로 돌아와야 한다
  return { clientId, clientSecret, redirectUri: appRedirectTarget(request, '/auth/kakao') }
}

/** GoTrue 는 우리가 준 nonce 를 SHA-256 해시해 토큰의 nonce 와 대조한다 — 그래서 인가 요청에는
 *  해시를 싣고, 검증에는 원문을 넘긴다. 평문을 양쪽에 쓰면 "Nonces mismatch" 로 거절된다(실측). */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function startKakaoAuth(
  request: NextRequest,
  credentials: KakaoCredentials,
): Promise<NextResponse> {
  const state = crypto.randomUUID()
  const nonce = crypto.randomUUID()

  // 303 이어야 브라우저가 GET 으로 따라간다 — 부르는 쪽이 폼 POST 다.
  // 링크(GET)로 두면 Next 의 prefetch 가 로그인을 미리 실행해 nonce 를 태운다
  const response = NextResponse.redirect(
    kakaoAuthorizeUrl({
      clientId: credentials.clientId,
      redirectUri: credentials.redirectUri,
      state,
      // 카카오에는 해시를 보낸다 (원문은 쿠키에만 둔다)
      nonce: await sha256Hex(nonce),
    }),
    303,
  )

  // 훔쳐가면 요청을 위조할 수 있는 값이다 — 스크립트가 읽을 이유가 없다
  response.cookies.set(KAKAO_STATE_COOKIE, JSON.stringify({ state, nonce }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10분이면 충분하다. 남겨 두면 재사용될 수 있다
  })

  return response
}

export interface KakaoReturnDeps {
  supabase: SupabaseClient
  credentials: KakaoCredentials
  exchange?: typeof exchangeKakaoCode
  fetchImpl?: typeof fetch
}

export async function handleKakaoReturn(
  request: NextRequest,
  { supabase, credentials, exchange = exchangeKakaoCode, fetchImpl }: KakaoReturnDeps,
): Promise<NextResponse> {
  const { searchParams } = request.nextUrl
  const saved = readState(request)

  // 사용자가 동의 화면에서 "취소"를 누른 것은 실패가 아니다 — 사연을 붙이지 않는다
  if (searchParams.get('error')) return done(request, LOGIN_PATH)

  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // 우리가 시작한 요청인지 확인한다. 이게 없으면 남의 인가 코드를 우리 세션으로 바꿔치기할 수 있다
  if (!code || !state || !saved || saved.state !== state) {
    return done(request, `${LOGIN_PATH}?reason=social-failed`)
  }

  try {
    const idToken = await exchange({ ...credentials, code }, fetchImpl)

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'kakao',
      token: idToken,
      nonce: saved.nonce,
    })
    if (error) throw error
  } catch (failure) {
    // 화면에는 원문을 싣지 않는다 (05 §규약). 서버 로그에는 진단에 필요한 만큼 남긴다 —
    // 이름만 남기면 "누가 왜 거절했는지"를 알 수 없어 다시 시켜 봐야 한다(실제로 겪었다).
    // 토큰·비밀은 담지 않는다: auth-js 의 message·status 는 사유만 담는다
    const error = failure as Error & { status?: number; code?: string }
    console.error(
      `[kakao] 로그인 실패 ${error.name}` +
        (error.status ? ` status=${error.status}` : '') +
        (error.code ? ` code=${error.code}` : '') +
        ` — ${error.message}`,
    )
    return done(request, `${LOGIN_PATH}?reason=social-failed`)
  }

  return done(request, '/')
}

function readState(request: NextRequest): { state: string; nonce: string } | null {
  const raw = request.cookies.get(KAKAO_STATE_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { state?: unknown; nonce?: unknown }
    if (typeof parsed.state !== 'string' || typeof parsed.nonce !== 'string') return null
    return { state: parsed.state, nonce: parsed.nonce }
  } catch {
    return null
  }
}

// 어느 길로 끝나든 state 쿠키는 지운다 — 한 번 쓴 값이 남아 있으면 재사용될 수 있다
function done(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(appRedirectTarget(request, path))
  response.cookies.set(KAKAO_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  })
  return response
}

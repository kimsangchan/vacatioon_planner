// 인증 왕복(메일 링크·OAuth·로그아웃)이 끝나고 우리 앱으로 되돌려보낼 주소를 짓는다.
//
// Route Handler 의 `request.nextUrl.origin` 을 쓰면 안 된다: 그건 클라이언트가 접속한 호스트가
// 아니라 **Next 가 바인드한 주소**다(next-server.js 의 attachRequestMeta — fetchHostname·port 가
// 있으면 Host 헤더를 아예 보지 않는다). 폰에서 LAN IP 로 들어온 사용자를 localhost 로 보내
// 연결 실패로 끝난다. 상대 경로도 답이 아니다 — Next 가 같은 바인드 주소로 다시 절대화한다(실측).
//
// 목적지 경로는 부르는 쪽이 고정하므로(사용자 입력이 아니다) Host 를 믿어도 열린 리다이렉트가 아니다.

import type { NextRequest } from 'next/server'

export function appRedirectTarget(request: NextRequest, path: string): string {
  const host = request.headers.get('host')
  if (!host) return path

  const proto =
    request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    new URL(request.url).protocol.replace(':', '')

  return `${proto}://${host}${path}`
}

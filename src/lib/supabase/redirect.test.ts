// 인증 왕복은 여러 라우트에서 "우리 앱의 어느 경로"로 되돌려보낸다. 그 주소를 짓는 규칙을
// 한 곳에 모은다 — 라우트마다 nextUrl.origin 을 쓰면 전부 같은 방식으로 틀린다.

import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { appRedirectTarget } from './redirect'

const requestWith = (headers: Record<string, string>) =>
  new NextRequest('http://127.0.0.1:3010/auth/callback', { headers })

describe('appRedirectTarget — 사용자가 접속한 호스트로 되돌려보낸다', () => {
  // Route Handler 의 nextUrl.origin 은 Next 가 바인드한 주소다(attachRequestMeta) —
  // 폰에서 LAN IP 로 들어온 사용자를 localhost 로 보내면 연결 실패로 끝난다
  it('Host 헤더를 따른다', () => {
    expect(appRedirectTarget(requestWith({ host: '192.168.0.5:3010' }), '/')).toBe(
      'http://192.168.0.5:3010/',
    )
  })

  it('프록시 뒤에서는 x-forwarded-proto 를 따른다', () => {
    expect(
      appRedirectTarget(
        requestWith({ host: 'trip.example.com', 'x-forwarded-proto': 'https' }),
        '/login?reason=signed-out',
      ),
    ).toBe('https://trip.example.com/login?reason=signed-out')
  })

  it('여러 프록시를 거치면 맨 앞 값이 원래 스킴이다', () => {
    expect(
      appRedirectTarget(
        requestWith({ host: 'trip.example.com', 'x-forwarded-proto': 'https, http' }),
        '/',
      ),
    ).toBe('https://trip.example.com/')
  })

  // Host 가 없는 요청은 실제로는 오지 않지만, 없다고 터지느니 상대 경로로 물러난다
  it('Host 가 없으면 상대 경로로 물러난다', () => {
    expect(appRedirectTarget(new NextRequest('http://127.0.0.1:3010/auth/callback'), '/')).toBe('/')
  })
})

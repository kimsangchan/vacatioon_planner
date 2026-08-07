// 어떤 MapProvider 를 쓸지 한 곳에서 정한다. 지도 키가 없으면 FakeMapProvider 로 떨어져
// 캔버스가 끝까지 동작한다 (배너로 사용자에게 알린다 — T0-2 전 개발 환경).

import { FakeMapProvider } from './fake'
import { NaverMapProvider } from './naver'
import type { MapProvider } from './provider'

export type MapProviderKind = 'naver' | 'fake'

export interface CreatedMapProvider {
  provider: MapProvider
  kind: MapProviderKind
}

// NEXT_PUBLIC_* 는 빌드 시 인라인되므로 리터럴 표기를 유지한다 (lib/supabase/env.ts 와 같은 규칙)
export function mapClientId(): string {
  return process.env.NEXT_PUBLIC_NCP_MAP_CLIENT_ID ?? ''
}

export function createMapProvider(): CreatedMapProvider {
  const clientId = mapClientId()
  if (!clientId) return { provider: new FakeMapProvider(), kind: 'fake' }
  return { provider: new NaverMapProvider({ clientId }), kind: 'naver' }
}

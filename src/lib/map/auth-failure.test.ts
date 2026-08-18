// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NaverMapProvider,
  installAuthFailureHook,
  onNaverAuthFailure,
  resetNaverAuthStateForTests,
  type NaverMapsNamespace,
} from './naver'

// 실측 회귀(2026-08-07): SDK 는 Map 생성 "후" 비동기 인증에 실패하면 전역
// navermap_authFailure 를 호출하고 naver.maps 내부를 비운다 — 이때 setPins 가
// null 접근으로 앱 전체를 죽였다. 훅 통지 + 방어를 함께 검증한다.

afterEach(() => resetNaverAuthStateForTests())

describe('navermap_authFailure 훅', () => {
  it('SDK 가 훅을 호출하면 구독자에게 알린다', () => {
    const target: { navermap_authFailure?: () => void } = {}
    installAuthFailureHook(target)
    const cb = vi.fn()
    onNaverAuthFailure(cb)

    target.navermap_authFailure?.()

    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('실패 이후에 구독해도 즉시 알린다 (늦은 구독자 유실 방지)', () => {
    const target: { navermap_authFailure?: () => void } = {}
    installAuthFailureHook(target)
    target.navermap_authFailure?.()

    const late = vi.fn()
    onNaverAuthFailure(late)

    expect(late).toHaveBeenCalledTimes(1)
  })
})

describe('인증 실패로 SDK 내부가 비어도 던지지 않는다', () => {
  function workingNamespace(): NaverMapsNamespace {
    return {
      Map: class {
        panTo() {}
        destroy() {}
      },
      Marker: class {
        setMap() {}
      },
      LatLng: class {},
      Point: class {},
      Event: { addListener: () => ({}), removeListener: () => {} },
    } as unknown as NaverMapsNamespace
  }

  it('setPins·panTo·destroy 가 조용히 물러난다', async () => {
    const ns = workingNamespace()
    const provider = new NaverMapProvider({
      clientId: 'test',
      loadSdk: async () => ns,
    })
    // mount 는 성공한다 — 인증 실패는 그 뒤에 온다
    await provider.mount(document.createElement('div'), { lat: 37.5, lng: 127 }, 12)

    // 인증 실패 시점 재현: SDK 가 네임스페이스 내부를 비운다
    const mutable = ns as unknown as Record<string, unknown>
    mutable.LatLng = null
    mutable.Marker = null
    mutable.Event = null

    const pin = {
      id: 'p1',
      latLng: { lat: 37.5, lng: 127 },
      category: 'spot' as const,
      selected: false,
      dayNumber: null,
      color: 'var(--pin-spot)',
    }
    expect(() => provider.setPins([pin])).not.toThrow()
    expect(() => provider.panTo({ lat: 35, lng: 129 })).not.toThrow()
    expect(() => provider.destroy()).not.toThrow()
  })
})

/** @vitest-environment jsdom */
// T6-1 — NaverMapProvider 의 mount 계약만 검증한다. 실지도 육안 확인은 T0-2(지도 키 발급) 후.
// SDK 로더를 주입해 스크립트 태그 없이 절차를 관찰한다 — 컴포넌트는 SDK 를 직접 import 하지 않는다(CLAUDE.md).

import { describe, expect, it, vi } from 'vitest'
import { naverMapScriptUrl, NaverMapProvider } from './naver'
import type { NaverMapsNamespace } from './naver'

const JEJU = { lat: 33.4996, lng: 126.5312 }

interface Listener {
  target: unknown
  type: string
  handler: (payload: unknown) => void
}

function fakeSdk() {
  const listeners: Listener[] = []
  const maps = {
    panTo: vi.fn(),
    destroy: vi.fn(),
    setCenter: vi.fn(),
  }
  const created: { el: HTMLElement; options: Record<string, unknown> }[] = []
  const markers: { options: Record<string, unknown>; map: unknown }[] = []

  const namespace = {
    Map: class {
      constructor(el: HTMLElement, options: Record<string, unknown>) {
        created.push({ el, options })
        Object.assign(this, maps)
      }
    },
    Marker: class {
      constructor(options: Record<string, unknown>) {
        const self = { options, map: options.map, setMap: (m: unknown) => (self.map = m) }
        markers.push(self)
        Object.assign(this, self)
      }
    },
    LatLng: class {
      constructor(
        readonly lat: number,
        readonly lng: number,
      ) {}
    },
    Point: class {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
    },
    Event: {
      addListener(target: unknown, type: string, handler: (payload: unknown) => void) {
        const listener: Listener = { target, type, handler }
        listeners.push(listener)
        return listener
      },
      removeListener: vi.fn(),
    },
  } as unknown as NaverMapsNamespace

  return { namespace, listeners, created, markers, maps }
}

describe('naverMapScriptUrl — 공식 문서 확인값 (2026-08-07)', () => {
  it('신버전 파라미터 ncpKeyId 로 v3 스크립트를 가리킨다', () => {
    const url = naverMapScriptUrl('KEY123')

    expect(url).toBe('https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=KEY123')
    // 구버전 ncpClientId 로 되돌아가면 인증이 실패한다 — 회귀 방지
    expect(url).not.toContain('ncpClientId')
  })
})

describe('NaverMapProvider — mount 계약 (T6-1, SDK 로더 목킹)', () => {
  it('로더가 준 네임스페이스로 지도를 만들고 중심·줌을 넘긴다', async () => {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    const el = document.createElement('div')

    await provider.mount(el, JEJU, 11)

    expect(sdk.created).toHaveLength(1)
    expect(sdk.created[0].el).toBe(el)
    expect(sdk.created[0].options.zoom).toBe(11)
    expect(sdk.created[0].options.center).toMatchObject({ lat: JEJU.lat, lng: JEJU.lng })
  })

  it('setPins 는 지도에 핀을 올리고, 다시 부르면 이전 핀을 걷어낸다', async () => {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    await provider.mount(document.createElement('div'), JEJU, 11)

    provider.setPins([
      { id: 'a', latLng: JEJU, category: 'restaurant', selected: false },
      { id: 'b', latLng: JEJU, category: 'spot', selected: true },
    ])
    expect(sdk.markers).toHaveLength(2)

    provider.setPins([{ id: 'a', latLng: JEJU, category: 'restaurant', selected: false }])
    // 첫 배치의 핀은 지도에서 내려간다 (setMap(null))
    expect(sdk.markers.slice(0, 2).every((m) => m.map === null)).toBe(true)
    expect(sdk.markers).toHaveLength(3)
  })

  it('핀의 mouseover·mouseout·click 을 hover·leave·tap 으로 옮긴다', async () => {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    const onPin = vi.fn()
    await provider.mount(document.createElement('div'), JEJU, 11)
    provider.onPinEvent(onPin)
    provider.setPins([{ id: 'a', latLng: JEJU, category: 'spot', selected: false }])

    for (const type of ['mouseover', 'mouseout', 'click']) {
      sdk.listeners.filter((l) => l.type === type).forEach((l) => l.handler({}))
    }

    expect(onPin.mock.calls).toEqual([
      ['a', 'hover'],
      ['a', 'leave'],
      ['a', 'tap'],
    ])
  })

  it('지도의 longtap·rightclick 을 롱프레스 하나로 모은다 (FR-016)', async () => {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    const onLongPress = vi.fn()
    await provider.mount(document.createElement('div'), JEJU, 11)
    provider.onLongPress(onLongPress)

    const types = sdk.listeners.map((l) => l.type)
    expect(types).toContain('longtap')
    expect(types).toContain('rightclick')

    sdk.listeners
      .find((l) => l.type === 'longtap')!
      .handler({ coord: { lat: () => JEJU.lat, lng: () => JEJU.lng } })

    expect(onLongPress).toHaveBeenCalledWith(JEJU)
  })

  it('destroy 는 지도를 정리한다', async () => {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    await provider.mount(document.createElement('div'), JEJU, 11)

    provider.destroy()

    expect(sdk.maps.destroy).toHaveBeenCalled()
  })
})

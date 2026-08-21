/** @vitest-environment jsdom */
// T6-1 — NaverMapProvider 의 mount 계약만 검증한다. 실지도 육안 확인은 T0-2(지도 키 발급) 후.
// SDK 로더를 주입해 스크립트 태그 없이 절차를 관찰한다 — 컴포넌트는 SDK 를 직접 import 하지 않는다(CLAUDE.md).

import { describe, expect, it, vi } from 'vitest'
import * as naverModule from './naver'
import { CATEGORY_ICON_PATH } from './provider'
import type { NaverMapsNamespace } from './naver'

const { naverMapScriptUrl, NaverMapProvider } = naverModule
const PLACE_LABEL_MIN_ZOOM = (
  naverModule as typeof naverModule & { PLACE_LABEL_MIN_ZOOM?: number }
).PLACE_LABEL_MIN_ZOOM

const JEJU = { lat: 33.4996, lng: 126.5312 }

interface Listener {
  target: unknown
  type: string
  handler: (payload: unknown) => void
}

function fakeSdk() {
  const listeners: Listener[] = []
  let zoom = 11
  // 실 SDK 의 fromCoordToOffset 은 **월드 픽셀**을 준다 — 지도를 옮겨도 값이 그대로다.
  // 그 성질을 그대로 흉내내야 "화면 좌표로 바꾸는 뺄셈"을 테스트가 검증할 수 있다.
  let viewport = { north: 34, west: 126 }
  const maps = {
    panTo: vi.fn(),
    destroy: vi.fn(),
    setCenter: vi.fn(),
    getProjection: () => ({
      fromCoordToOffset: (coord: { lat: number; lng: number }) => ({
        x: coord.lng * 1000,
        y: -coord.lat * 1000,
      }),
    }),
    getBounds: () => ({
      getNE: () => ({ lat: () => viewport.north, lng: () => viewport.west + 1 }),
      getSW: () => ({ lat: () => viewport.north - 1, lng: () => viewport.west }),
    }),
    getZoom: () => zoom,
  }
  const panViewport = (north: number, west: number) => {
    viewport = { north, west }
  }
  const setZoom = (nextZoom: number) => {
    zoom = nextZoom
  }
  const created: { el: HTMLElement; options: Record<string, unknown> }[] = []
  const markers: { options: Record<string, unknown>; map: unknown }[] = []

  const namespace = {
    Map: class {
      constructor(el: HTMLElement, options: Record<string, unknown>) {
        zoom = options.zoom as number
        created.push({ el, options })
        Object.assign(this, maps)
      }
    },
    Marker: class {
      constructor(options: Record<string, unknown>) {
        const self = {
          options,
          map: options.map,
          setMap: (m: unknown) => (self.map = m),
          setIcon: (icon: unknown) => {
            self.options = { ...self.options, icon }
          },
        }
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

  return { namespace, listeners, created, markers, maps, panViewport, setZoom }
}

describe('NaverMapProvider — 핀 모양 (결정 #41)', () => {
  async function pinned(
    pin: Parameters<InstanceType<typeof NaverMapProvider>['setPins']>[0][number],
  ) {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    await provider.mount(document.createElement('div'), JEJU, 11)
    provider.setPins([pin])
    const icon = sdk.markers[0].options.icon as { content: string; anchor: unknown }
    return icon.content
  }

  it('배치된 곳은 일차 색 원에 일차 번호를 낸다 — 색은 "몇 일차인가"만 나른다', async () => {
    const content = await pinned({
      id: 'a',
      label: 'Lunch place',
      latLng: JEJU,
      category: 'restaurant',
      selected: false,
      orderNumber: 2,
      color: 'var(--day-sky)',
    })

    expect(content).toContain('var(--day-sky)')
    expect(content).toContain('>2<')
    // 숫자를 냈으면 아이콘은 내지 않는다 — 22px 에 둘 다 넣으면 둘 다 안 읽힌다
    expect(content).not.toContain('<svg')
  })

  it('보관함은 카테고리 색 원에 카테고리 아이콘을 낸다', async () => {
    const content = await pinned({
      id: 'a',
      label: 'Hotel',
      latLng: JEJU,
      category: 'lodging',
      selected: false,
      orderNumber: null,
      color: 'var(--pin-lodging)',
    })

    expect(content).toContain('var(--pin-lodging)')
    expect(content).toContain('<svg')
    expect(content).toContain(CATEGORY_ICON_PATH.lodging)
  })
})

describe('NaverMapProvider — 장소 이름 라벨', () => {
  const pin = (selected = false) => ({
    id: 'a',
    label: `해녀의 집 <script>alert("x")</script> & '바다'`,
    latLng: JEJU,
    category: 'restaurant' as const,
    selected,
    orderNumber: null,
    color: 'var(--pin-restaurant)',
  })

  async function mountedAt(zoom: number) {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    await provider.mount(document.createElement('div'), JEJU, zoom)
    return { sdk, provider }
  }

  function iconOf(marker: { options: Record<string, unknown> }) {
    return marker.options.icon as { content: string; anchor: unknown }
  }

  function fire(sdk: ReturnType<typeof fakeSdk>, type: string) {
    for (const listener of sdk.listeners.filter((entry) => entry.type === type)) {
      listener.handler({})
    }
  }

  it('라벨 노출 최소 줌은 14로 고정한다', () => {
    expect(PLACE_LABEL_MIN_ZOOM).toBe(14)
  })

  it('줌 13에서는 일반 라벨을 숨기지만 선택된 장소 이름은 바로 보여준다', async () => {
    const ordinary = await mountedAt(13)
    ordinary.provider.setPins([pin(false)])
    expect(iconOf(ordinary.sdk.markers[0]).content).not.toContain('해녀의 집')

    const selected = await mountedAt(13)
    selected.provider.setPins([pin(true)])
    expect(iconOf(selected.sdk.markers[0]).content).toContain('해녀의 집')
  })

  it('줌 14부터 일반 장소 이름을 보여주고 HTML 특수문자를 모두 이스케이프한다', async () => {
    const { sdk, provider } = await mountedAt(14)
    provider.setPins([pin(false)])

    const content = iconOf(sdk.markers[0]).content
    expect(content).toContain('해녀의 집')
    expect(content).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;')
    expect(content).toMatch(/&amp; &(?:#0?39|apos);바다&(?:#0?39|apos);/)
    expect(content).not.toContain('<script>')
  })

  it('확대·축소와 이동은 같은 SDK Marker의 position·anchor를 유지하며 라벨만 바꾼다', async () => {
    const { sdk, provider } = await mountedAt(13)
    provider.setPins([pin(false)])
    const marker = sdk.markers[0]
    const position = marker.options.position
    const anchor = iconOf(marker).anchor
    const listenerCount = sdk.listeners.length

    sdk.setZoom(14)
    fire(sdk, 'zoom_changed')
    fire(sdk, 'bounds_changed')
    fire(sdk, 'center_changed')

    expect(sdk.markers).toHaveLength(1)
    expect(sdk.markers[0]).toBe(marker)
    expect(marker.options.position).toEqual(position)
    expect(iconOf(marker).anchor).toEqual(anchor)
    expect(iconOf(marker).content).toContain('해녀의 집')
    expect(sdk.listeners).toHaveLength(listenerCount)
  })

  it('반복 줌 이벤트에도 Marker와 이벤트 리스너를 증식시키지 않는다', async () => {
    const { sdk, provider } = await mountedAt(13)
    const onPin = vi.fn()
    provider.onPinEvent(onPin)
    provider.setPins([pin(false)])
    const marker = sdk.markers[0]
    const listeners = [...sdk.listeners]

    for (const zoom of [14, 13, 14, 15]) {
      sdk.setZoom(zoom)
      fire(sdk, 'zoom_changed')
    }

    expect(sdk.markers).toEqual([marker])
    expect(sdk.listeners).toEqual(listeners)
    for (const type of ['mouseover', 'mouseout', 'click']) {
      sdk.listeners
        .filter((listener) => listener.type === type)
        .forEach((listener) => listener.handler({}))
    }
    expect(onPin).toHaveBeenCalledTimes(3)
  })
})

describe('NaverMapProvider — 좌표 투영 (핀에 붙는 카드가 쓴다)', () => {
  // 실측으로 잡은 결함: fromCoordToOffset 을 그대로 화면 좌표로 썼더니 지도를 끌어도
  // 값이 1058.999/441.96 에 고정됐다. 그건 월드 픽셀이라 뷰포트 북서 모서리를 빼야 한다.
  async function mounted() {
    const sdk = fakeSdk()
    const provider = new NaverMapProvider({
      clientId: 'KEY123',
      loadSdk: () => Promise.resolve(sdk.namespace),
    })
    await provider.mount(document.createElement('div'), JEJU, 11)
    return { sdk, provider }
  }

  it('뷰포트 북서 모서리를 원점으로 하는 화면 좌표를 준다', async () => {
    const { provider } = await mounted()

    // 북서 = (lat 34, lng 126) → 월드 (126000, -34000). 대상 (lat 33.5, lng 126.5) → (126500, -33500)
    expect(provider.project({ lat: 33.5, lng: 126.5 })).toEqual({ x: 500, y: 500 })
  })

  it('지도를 옮기면 같은 좌표의 화면 위치가 달라진다 — 여기가 고정이면 카드가 안 따라온다', async () => {
    const { sdk, provider } = await mounted()
    const before = provider.project({ lat: 33.5, lng: 126.5 })

    sdk.panViewport(34.2, 126.3)
    const after = provider.project({ lat: 33.5, lng: 126.5 })

    expect(after).not.toEqual(before)
    expect(after).toEqual({ x: 200, y: 700 })
  })

  it('지도가 움직이면 구독자를 깨우고, 해제하면 더는 부르지 않는다', async () => {
    const { sdk, provider } = await mounted()
    const seen = vi.fn()
    const unsubscribe = provider.onViewportChange(seen)

    const fire = () => {
      for (const listener of sdk.listeners.filter((l) => l.type === 'bounds_changed')) {
        listener.handler({})
      }
    }
    fire()
    expect(seen).toHaveBeenCalledTimes(1)

    unsubscribe()
    fire()
    expect(seen).toHaveBeenCalledTimes(1)
  })
})

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
      { id: 'a', label: 'Lunch place', latLng: JEJU, category: 'restaurant', selected: false, orderNumber: null, color: 'var(--pin-restaurant)' },
      { id: 'b', label: 'Beach', latLng: JEJU, category: 'spot', selected: true, orderNumber: 2, color: 'var(--day-sky)' },
    ])
    expect(sdk.markers).toHaveLength(2)

    provider.setPins([
      { id: 'a', label: 'Lunch place', latLng: JEJU, category: 'restaurant', selected: false, orderNumber: null, color: 'var(--pin-restaurant)' },
    ])
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
    provider.setPins([
      { id: 'a', label: 'Beach', latLng: JEJU, category: 'spot', selected: false, orderNumber: null, color: 'var(--pin-spot)' },
    ])

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

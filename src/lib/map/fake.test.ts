// T6-1 — MapProvider 계약을 FakeMapProvider 로 고정한다 (SPEC §알고리즘 5).
// DOM 없이 돌아야 한다: 지도 SDK 없이도 핀 상태와 이벤트를 그대로 관찰할 수 있어야
// 캔버스(T6-3)와 롱프레스(T6-5) 테스트가 실지도 없이 성립한다.

import { describe, expect, it, vi } from 'vitest'
import { FakeMapProvider } from './fake'
import type { Pin } from './provider'

const JEJU = { lat: 33.4996, lng: 126.5312 }
const SEONGSAN = { lat: 33.4581, lng: 126.9425 }

function pin(id: string, category: Pin['category'], selected = false): Pin {
  return {
    id,
    label: `Place ${id}`,
    latLng: SEONGSAN,
    category,
    selected,
    orderNumber: null,
    color: 'var(--pin-spot)',
  }
}

// 노드 환경에서도 돌아야 하므로 컨테이너는 형태만 맞춘 자리표시다
const container = {} as HTMLElement

describe('FakeMapProvider — MapProvider 계약 (T6-1)', () => {
  it('mount 이 컨테이너·중심·줌을 그대로 보관한다', async () => {
    const provider = new FakeMapProvider()
    expect(provider.mounted).toBe(false)

    await provider.mount(container, JEJU, 11)

    expect(provider.mounted).toBe(true)
    expect(provider.element).toBe(container)
    expect(provider.center).toEqual(JEJU)
    expect(provider.zoom).toBe(11)
  })

  it('setPins 는 이전 핀을 대체하고, 선택된 핀만 하이라이트로 노출한다', async () => {
    const provider = new FakeMapProvider()
    await provider.mount(container, JEJU, 11)

    provider.setPins([pin('a', 'restaurant'), pin('b', 'lodging', true)])
    expect(provider.pins.map((p) => p.id)).toEqual(['a', 'b'])
    expect(provider.pins.map((p) => p.label)).toEqual(['Place a', 'Place b'])
    expect(provider.highlightedIds).toEqual(['b'])

    provider.setPins([pin('c', 'spot', true)])
    expect(provider.pins.map((p) => p.id)).toEqual(['c'])
    expect(provider.highlightedIds).toEqual(['c'])
  })

  it('panTo 호출을 순서대로 기록한다', async () => {
    const provider = new FakeMapProvider()
    await provider.mount(container, JEJU, 11)

    provider.panTo(SEONGSAN)
    provider.panTo(JEJU)

    expect(provider.pannedTo).toEqual([SEONGSAN, JEJU])
  })

  it('onPinEvent 로 등록한 콜백에 hover·tap·leave 를 그대로 전달한다', async () => {
    const provider = new FakeMapProvider()
    const first = vi.fn()
    const second = vi.fn()
    await provider.mount(container, JEJU, 11)
    provider.onPinEvent(first)
    provider.onPinEvent(second)

    provider.emitPinEvent('a', 'hover')
    provider.emitPinEvent('a', 'leave')
    provider.emitPinEvent('b', 'tap')

    expect(first.mock.calls).toEqual([
      ['a', 'hover'],
      ['a', 'leave'],
      ['b', 'tap'],
    ])
    expect(second).toHaveBeenCalledTimes(3)
  })

  it('onLongPress 로 등록한 콜백에 좌표를 전달한다 (FR-016 준비)', async () => {
    const provider = new FakeMapProvider()
    const onLongPress = vi.fn()
    await provider.mount(container, JEJU, 11)
    provider.onLongPress(onLongPress)

    provider.emitLongPress(SEONGSAN)

    expect(onLongPress).toHaveBeenCalledWith(SEONGSAN)
  })

  it('destroy 후에는 핀도 리스너도 남지 않는다', async () => {
    const provider = new FakeMapProvider()
    const onPin = vi.fn()
    await provider.mount(container, JEJU, 11)
    provider.onPinEvent(onPin)
    provider.setPins([pin('a', 'spot')])

    provider.destroy()

    expect(provider.mounted).toBe(false)
    expect(provider.pins).toEqual([])
    provider.emitPinEvent('a', 'tap')
    expect(onPin).not.toHaveBeenCalled()
  })
})

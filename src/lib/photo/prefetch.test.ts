/** @vitest-environment jsdom */
// T6-4b — SC-002(호버→카드 400ms)의 전제. 카드가 뜨는 순간 네트워크 왕복이 있으면 못 지킨다.
// 캔버스가 열릴 때 Trip Bundle 의 thumb_path 를 미리 받아 둔다 (FR-006).

import { afterEach, describe, expect, it } from 'vitest'
import { prefetchThumbnails } from './prefetch'

const links = () =>
  Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="prefetch"]'))

afterEach(() => {
  document.head.innerHTML = ''
})

describe('prefetchThumbnails — 썸네일 미리 받기 (FR-006 / SC-002)', () => {
  it('썸네일마다 이미지 프리페치 링크를 붙인다', () => {
    prefetchThumbnails(['https://cdn.test/a-thumb.webp', 'https://cdn.test/b-thumb.webp'])

    expect(links().map((link) => link.href)).toEqual([
      'https://cdn.test/a-thumb.webp',
      'https://cdn.test/b-thumb.webp',
    ])
    expect(links().every((link) => link.getAttribute('as') === 'image')).toBe(true)
  })

  it('같은 주소를 두 번 받지 않는다', () => {
    prefetchThumbnails(['https://cdn.test/a-thumb.webp'])
    prefetchThumbnails(['https://cdn.test/a-thumb.webp', 'https://cdn.test/b-thumb.webp'])

    expect(links()).toHaveLength(2)
  })

  it('정리하면 자기가 붙인 링크만 걷어낸다', () => {
    const keep = document.createElement('link')
    keep.rel = 'prefetch'
    keep.href = 'https://cdn.test/keep-thumb.webp'
    document.head.appendChild(keep)

    const cleanup = prefetchThumbnails(['https://cdn.test/a-thumb.webp'])
    expect(links()).toHaveLength(2)

    cleanup()
    expect(links().map((link) => link.href)).toEqual(['https://cdn.test/keep-thumb.webp'])
  })

  it('사진이 없으면 아무것도 붙이지 않는다 (사진 없는 Place — PRD 엣지)', () => {
    prefetchThumbnails([])

    expect(links()).toHaveLength(0)
  })
})

// T8-2 / SC-002 (UX-03) — "호버/탭 → 미리보기 카드 표시 ≤400ms (사진은 프리로드된 썸네일)"
// (docs/design/03 §성공 기준 · 근거 L-10 도허티 임계).
//
// 계측은 페이지 안에서 performance.now() 로 한다: 드라이버 왕복 시간이 실측값에 섞이면
// 재는 것이 앱이 아니라 테스트 하네스가 된다. 시작점은 항목이 받은 mouseover(캡처 단계),
// 끝점은 카드가 DOM 에 붙은 다음 프레임이다.
//
// 전제인 "프리페치 완료"는 짐작하지 않고 resource timing 으로 확인한 뒤에 잰다.

import { expect, test } from 'playwright/test'
import { signInThroughUi, uniqueE2eEmail } from './support/auth'
import { storageItem } from './support/canvas'
import {
  dropTrip,
  seedPlacePhoto,
  seedPlaces,
  seedTrip,
  signInNode,
  type E2eUser,
} from './support/seed'

declare global {
  interface Window {
    __previewLatency?: Promise<number>
  }
}

const EMAIL = uniqueE2eEmail('sc002')
const LATENCY_LIMIT_MS = 400
const RUNS = 3
const CARD_SELECTOR = '[data-testid="preview-card"][data-variant="card"]'

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

test.describe('SC-002 — 호버에서 미리보기 카드까지', () => {
  let user: E2eUser
  let tripId = ''

  test.beforeAll(async () => {
    // UI 를 거치지 않고 시드한다 — 측정 전 준비는 짧을수록 좋다
    user = await signInNode(EMAIL)
    const seeded = await seedTrip(user, {
      name: 'SC-002 계측',
      startDate: '2026-09-20',
      endDate: '2026-09-21',
    })
    tripId = seeded.tripId

    const placeIds = await seedPlaces(user, tripId, [
      { name: '흑돼지 명가', category: 'restaurant', lat: 33.489, lng: 126.4983 },
      { name: '바다뷰 호텔', category: 'lodging', lat: 33.5142, lng: 126.5219 },
      { name: '성산일출봉', category: 'spot', lat: 33.4581, lng: 126.9425 },
    ])
    await seedPlacePhoto(user, placeIds[0])
  })

  test.afterAll(async () => {
    if (tripId === '') return
    await dropTrip(user, tripId)
  })

  test('썸네일 프리페치 상태에서 3회 측정 중앙값 ≤400ms', async ({ page }, testInfo) => {
    await signInThroughUi(page, EMAIL)
    await page.goto(`/trip/${tripId}`)
    await expect(storageItem(page, '흑돼지 명가')).toBeVisible()

    // 전제 확인 — 캔버스가 열릴 때 썸네일을 이미 받아 뒀다 (lib/photo/prefetch.ts)
    await expect(page.locator('link[rel="prefetch"][as="image"]')).toHaveCount(1)
    await page.waitForFunction(() =>
      performance
        .getEntriesByType('resource')
        .some((entry) => entry.name.includes('-thumb.webp')),
    )

    const item = storageItem(page, '흑돼지 명가')
    const card = page.locator(CARD_SELECTOR)
    const samples: number[] = []

    for (let run = 0; run < RUNS; run += 1) {
      // 리스너는 호버할 바로 그 요소에 단다 — 선택자로 다시 찾으면 다른 줄을 잡을 수 있다
      await item.evaluate((target, cardSelector) => {
        window.__previewLatency = new Promise<number>((resolve) => {
          let startedAt: number | null = null
          target.addEventListener(
            'mouseover',
            () => {
              startedAt = performance.now()
            },
            { capture: true, once: true },
          )

          const observer = new MutationObserver(() => {
            if (startedAt === null) return
            if (!document.querySelector(cardSelector)) return
            observer.disconnect()
            const shownAt = startedAt
            // 붙은 다음 프레임 = 사람이 볼 수 있게 된 시점
            requestAnimationFrame(() => resolve(performance.now() - shownAt))
          })
          observer.observe(document.body, { childList: true, subtree: true })
        })
      }, CARD_SELECTOR)

      await item.hover()
      samples.push(
        await page.evaluate(() => {
          const pending = window.__previewLatency
          if (!pending) throw new Error('계측 준비가 안 된 채로 호버했어요')
          return pending
        }),
      )
      await expect(card).toBeVisible()

      // 다음 측정을 위해 카드를 걷는다 — 헤더 쪽으로 포인터를 옮기면 mouseleave 가 온다
      await page.mouse.move(5, 5)
      await expect(card).toHaveCount(0)
    }

    const value = median(samples)
    const rounded = samples.map((sample) => Math.round(sample))
    testInfo.annotations.push({
      type: 'SC-002',
      description: `중앙값 ${Math.round(value)}ms (측정 ${rounded.join(' / ')}ms)`,
    })
    console.log(`[SC-002] 호버→카드 ${rounded.join('ms, ')}ms · 중앙값 ${Math.round(value)}ms`)

    expect(value).toBeLessThanOrEqual(LATENCY_LIMIT_MS)
  })
})

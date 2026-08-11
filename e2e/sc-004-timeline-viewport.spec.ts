// T8-2 / SC-004 (UX-06) — "일자 타임라인에서 당일 모든 Leg의 출발·도착 시각이 iPhone 세로
// 뷰포트(390×844) 1스크롤 내 표시 (Stop 8개+Leg 3개 기준)" (docs/design/03 §성공 기준).
//
// 사전 상태는 UI 로 만들지 않는다 — Stop 8 + Leg 3 을 화면으로 쌓으면 계측이 아니라 인내가 된다.
// 재는 값은 두 가지다:
//   ① 스크롤 0회에서 뷰포트 안에 들어온 Leg 시각 요소 수 (엄격한 기준)
//   ② 리스트 스크롤 영역의 scrollHeight — 1스크롤 = 뷰포트 2장이 상한이다 (SC-004 문구)
// 둘 다 실측값을 리포트에 남긴다. 기준을 통과하든 아니든 숫자가 근거다.

import { expect, test } from 'playwright/test'
import { signInThroughUi, uniqueE2eEmail } from './support/auth'
import { dayItems } from './support/canvas'
import {
  dropTrip,
  seedLegs,
  seedPlaces,
  seedStops,
  seedTrip,
  signInNode,
  type E2eUser,
} from './support/seed'

const EMAIL = uniqueE2eEmail('sc004')
const VIEWPORT = { width: 390, height: 844 }
const ONE_SCROLL_LIMIT = VIEWPORT.height * 2
const LEG_ROW = /\d\d:\d\d→\d\d:\d\d/
// 시각만 담은 요소를 정확히 집는다 — 앞뒤가 붙은 조상 요소까지 걸리면 개수가 부풀어 오른다
const LEG_TIME = /^\d\d:\d\d→\d\d:\d\d$/

// Stop 8 + Leg 3 = 통합 position 0..10 (결정 #15 — 순서의 진실은 하나의 시퀀스다)
const STOP_SEEDS = [
  { name: '김만복김밥', position: 0, startTime: '09:00', cost: 9000 },
  { name: '동문시장', position: 1, startTime: '09:40', cost: null },
  { name: '용두암', position: 3, startTime: '10:50', cost: null },
  { name: '이호테우해변', position: 4, startTime: '12:00', cost: null },
  { name: '한라수목원', position: 5, startTime: '13:30', cost: 3000 },
  { name: '흑돼지골목', position: 7, startTime: '15:00', cost: 42000 },
  { name: '카페한라', position: 8, startTime: '16:20', cost: null },
  { name: '바다뷰 호텔', position: 10, startTime: '18:30', cost: null },
]

const LEG_SEEDS = [
  { position: 2, departAt: '10:10', arriveAt: '10:40', from: '동문시장', to: '용두암' },
  { position: 6, departAt: '14:00', arriveAt: '14:30', from: '한라수목원', to: '흑돼지골목' },
  { position: 9, departAt: '17:00', arriveAt: '17:45', from: '카페한라', to: '호텔' },
]

test.use({ viewport: VIEWPORT })

test.describe('SC-004 — 390×844 에서 하루 타임라인', () => {
  let user: E2eUser
  let tripId = ''

  test.beforeAll(async () => {
    user = await signInNode(EMAIL)
    const seeded = await seedTrip(user, {
      name: 'SC-004 계측',
      startDate: '2026-09-25',
      endDate: '2026-09-26',
    })
    tripId = seeded.tripId

    const placeIds = await seedPlaces(
      user,
      tripId,
      STOP_SEEDS.map((seed, index) => ({
        name: seed.name,
        category: index === STOP_SEEDS.length - 1 ? ('lodging' as const) : ('spot' as const),
        lat: 33.45 + index * 0.01,
        lng: 126.5 + index * 0.01,
      })),
    )

    const dayId = seeded.dayIds[0]
    await seedStops(
      user,
      dayId,
      STOP_SEEDS.map((seed, index) => ({
        placeId: placeIds[index],
        position: seed.position,
        startTime: seed.startTime,
        cost: seed.cost,
      })),
    )
    await seedLegs(
      user,
      dayId,
      LEG_SEEDS.map((seed) => ({
        position: seed.position,
        mode: 'bus' as const,
        departAt: seed.departAt,
        arriveAt: seed.arriveAt,
        from: seed.from,
        to: seed.to,
        cost: null,
      })),
    )
  })

  test.afterAll(async () => {
    if (tripId === '') return
    await dropTrip(user, tripId)
  })

  test('전 Leg 의 출발·도착 시각이 1스크롤 안에 있다', async ({ page }, testInfo) => {
    await signInThroughUi(page, EMAIL)
    await page.goto(`/trip/${tripId}`)

    // 모바일 레이아웃은 하단 시트다 — 올려서 보는 게 이 화면의 기본 동작이다 (스크롤이 아니다)
    await page.getByRole('button', { name: '리스트 올리기' }).click()
    await page.getByRole('button', { name: '1일차', exact: true }).click()
    await expect(dayItems(page)).toHaveCount(11)

    const legTimes = page
      .locator('li[data-testid^="day-item-"]')
      .filter({ hasText: LEG_ROW })
      .getByText(LEG_TIME)
    await expect(legTimes).toHaveCount(LEG_SEEDS.length)

    const boxes = await legTimes.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect()
        return { text: node.textContent ?? '', top: Math.round(rect.top), bottom: Math.round(rect.bottom) }
      }),
    )

    const metrics = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label$="일정"]')
      if (!section) return null

      // 실제로 스크롤되는 조상을 찾는다 (overflow-hidden 은 넘쳐도 스크롤이 아니다)
      let scroller = section.parentElement
      while (scroller) {
        const overflowY = getComputedStyle(scroller).overflowY
        const scrolls =
          (overflowY === 'auto' || overflowY === 'scroll') &&
          scroller.scrollHeight > scroller.clientHeight
        if (scrolls) break
        scroller = scroller.parentElement
      }

      return {
        timelineHeight: Math.round(section.getBoundingClientRect().height),
        scrollHeight: scroller?.scrollHeight ?? Math.round(section.scrollHeight),
        clientHeight: scroller?.clientHeight ?? Math.round(section.clientHeight),
        scrollTop: Math.round(scroller?.scrollTop ?? 0),
      }
    })
    expect(metrics).not.toBeNull()

    const withinViewport = boxes.filter((box) => box.top >= 0 && box.bottom <= VIEWPORT.height)
    const detail = boxes.map((box) => `${box.text.trim()}@${box.top}~${box.bottom}`).join(' · ')
    const summary =
      `스크롤 0회 노출 ${withinViewport.length}/${boxes.length} [${detail}] · ` +
      `타임라인 높이 ${metrics!.timelineHeight}px · 스크롤 영역 ${metrics!.scrollHeight}/${metrics!.clientHeight}px · ` +
      `1스크롤 상한 ${ONE_SCROLL_LIMIT}px`

    testInfo.annotations.push({ type: 'SC-004', description: summary })
    console.log(`[SC-004] ${summary}`)

    // 스크롤은 0에서 시작한다 — 위 노출 수치의 전제
    expect(metrics!.scrollTop).toBe(0)
    // 모든 Leg 시각이 잘리지 않고 그려졌다
    for (const box of boxes) expect(box.bottom).toBeGreaterThan(box.top)
    // SC-004 기준: 하루치가 1스크롤(뷰포트 2장) 안에 들어온다
    expect(metrics!.scrollHeight).toBeLessThanOrEqual(ONE_SCROLL_LIMIT)
  })
})

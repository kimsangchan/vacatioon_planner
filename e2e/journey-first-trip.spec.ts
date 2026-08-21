// T8-1 여정 1 — 첫 여행 만들기 (docs/design/06 §E2E 후보 1, US-1~3 통합 · 스모크 겸용).
// 가입(OTP) → Trip → 장소 3종 → 사진 → 배치 → Leg(익일 도착 게이트 포함) → 타임라인.
//
// 이 한 편이 실패하면 앱이 세로로 끊긴 것이다 — 그래서 화면 하나가 아니라 흐름 전체를 본다.
// 검색만 고정 픽스처로 가로챈다 (e2e/support/place-search.ts — 실키 소비 0).

import { expect, test } from 'playwright/test'
import { signInThroughUi, uniqueE2eEmail } from './support/auth'
import {
  createTripThroughUi,
  dayItem,
  dayItems,
  savePlaceThroughSearch,
  storageItem,
} from './support/canvas'
import { PHOTO_PNG } from './support/images'
import { stubPlaceSearch } from './support/place-search'
import { dropTrip, signInNode } from './support/seed'

const EMAIL = uniqueE2eEmail('journey')

test.describe('여정 1 — 첫 여행 만들기 (스모크)', () => {
  let tripId = ''

  test.afterAll(async () => {
    if (tripId === '') return
    // 이 테스트가 만든 Trip 한 건만 지운다 (전역 wipe 금지)
    await dropTrip(await signInNode(EMAIL), tripId)
  })

  test('가입 → 여행 → 장소 3종 → 사진 → 배치 → 이동 → 타임라인', async ({ page }, testInfo) => {
    const search = await stubPlaceSearch(page)

    // ① 가입 (FR-001 — 처음 보는 주소면 코드 한 번이 곧 가입이다)
    await signInThroughUi(page, EMAIL)

    // ② 여행 만들기 (FR-002 · E-02 — 기간만큼 Day 가 함께 생긴다)
    tripId = await createTripThroughUi(page, {
      name: 'E2E 제주 2일',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
    })

    // ③ 장소 3종 저장 (FR-003 · E-04 — 카테고리 버튼이 곧 저장이다)
    await savePlaceThroughSearch(page, {
      query: '흑돼지',
      resultName: '흑돼지 명가',
      categoryLabel: '식당',
    })
    await savePlaceThroughSearch(page, {
      query: '호텔',
      resultName: '바다뷰 호텔',
      categoryLabel: '숙박',
    })
    await savePlaceThroughSearch(page, {
      query: '일출봉',
      resultName: '성산일출봉',
      categoryLabel: '스팟',
    })
    expect(search.calls()).toBeGreaterThan(0) // 실 네이버가 아니라 픽스처를 탔다

    // ④ 사진 1장 (FR-004 · E-05 — 원본이 아니라 리사이즈본·썸네일이 올라간다)
    await storageItem(page, '흑돼지 명가').click()
    // 데스크톱에서 목록·핀을 누르면 먼저 **말풍선**이 뜬다 — 상세(사진·메모)는 '자세히' 뒤다 (결정 #52).
    // 말풍선은 "여기가 어디인지"만 답하고 길어질 여지를 두지 않는다
    await page.getByRole('button', { name: '자세히' }).click()
    const sheet = page.locator('[data-testid="preview-card"][data-variant="sheet"]')
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('사진 담기').setInputFiles(PHOTO_PNG)
    await expect(sheet.getByText('사진을 담았어요.')).toBeVisible()
    await expect(sheet.getByRole('img', { name: '흑돼지 명가 사진' }).first()).toBeVisible()

    // 별이 좁은 패널을 넘지 않는다 (사용자 지적) — 데스크톱 오른쪽 패널도 **같은 시트**라
    // 손가락 크기(44px) 다섯을 그대로 쓰면 380px 패널 밖으로 나간다. jsdom 은 못 잡는다
    const stars = await sheet.evaluate((el) => {
      const radios = Array.from(el.querySelectorAll('[role="radio"]'))
      const last = radios[radios.length - 1]
      const card = el.getBoundingClientRect()
      return {
        count: radios.length,
        width: last ? Math.round(last.getBoundingClientRect().width) : 0,
        lastRight: last ? Math.round(last.getBoundingClientRect().right) : 0,
        cardRight: Math.round(card.right),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }
    })
    testInfo.annotations.push({
      type: '패널 별',
      description: `별 ${stars.count}개 · 한 칸 ${stars.width}px · 오른쪽 끝 ${stars.lastRight} ≤ 카드 ${stars.cardRight}`,
    })
    console.log(`[패널 별] ${stars.count}개 · ${stars.width}px · ${stars.lastRight} ≤ ${stars.cardRight}`)

    expect(stars.count).toBe(5)
    expect(stars.lastRight).toBeLessThanOrEqual(stars.cardRight)
    expect(stars.scrollWidth).toBeLessThanOrEqual(stars.clientWidth + 1)

    // 데스크톱에서 상세는 지도 위가 아니라 **패널 안**에 뜨고, 그동안 목록은 자리를 내준다
    // (네이버 지도 방식). 목록의 배치 버튼을 쓰려면 상세를 닫아 목록으로 돌아온다
    await page.getByRole('button', { name: '미리보기 닫기' }).click()

    // ⑤ 일정 배치 (FR-007 — "일정에 넣기" → 일차, 2탭)
    for (const name of ['흑돼지 명가', '바다뷰 호텔', '성산일출봉']) {
      await page.getByRole('button', { name: `${name} 일정에 넣기` }).click()
      await page.getByRole('button', { name: `${name} 1일차에 넣기` }).click()
      await expect(page.getByRole('button', { name: `${name} 일정에 넣기` })).toHaveCount(0)
    }

    // ⑥ 1일차 타임라인으로 (탭 전환 — 라우트가 늘지 않는다, SC-003)
    await page.getByRole('button', { name: '1일차', exact: true }).click()
    await expect(dayItems(page)).toHaveCount(3)

    // Stop 시각·가격 (결정 #24 — Day 합계는 Stop + Leg)
    const first = dayItem(page, '흑돼지 명가')
    // 행 액션은 '작업 열기' 뒤에 접혀 있다 — 한 줄에 버튼 넷을 늘어놓으면 목록이 시끄럽다
    await first.getByRole('button', { name: '흑돼지 명가 작업 열기' }).click()
    await first.getByRole('button', { name: '시각·가격 적기' }).click()
    await first.getByLabel('방문 시각').fill('09:00')
    // '가격'만으로 찾으면 옆의 aria-label "시각·가격 적기" 버튼까지 걸린다
    await first.getByRole('textbox', { name: '가격', exact: true }).fill('12000')
    await first.getByRole('button', { name: '시각·가격 저장하기' }).click()
    await expect(first).toContainText('12,000원')

    // 뒤 항목에 이른 시각을 적으면 경고 배지가 붙는다 (순서의 진실은 position — 결정 #15)
    const second = dayItem(page, '바다뷰 호텔')
    await second.getByRole('button', { name: '바다뷰 호텔 작업 열기' }).click()
    await second.getByRole('button', { name: '시각·가격 적기' }).click()
    await second.getByLabel('방문 시각').fill('08:30')
    await second.getByRole('button', { name: '시각·가격 저장하기' }).click()
    await expect(second).toHaveAttribute('data-time-warning', 'true')

    // ⑦ 이동 2건 (FR-008 · E-08)
    await page.getByRole('button', { name: '이동 적기' }).click()
    const legForm = page.getByTestId('leg-form')
    await legForm.getByLabel('출발 시각').fill('10:30')
    await legForm.getByLabel('도착 시각').fill('11:20')
    await legForm.getByLabel('출발 지점').fill('제주시청')
    await legForm.getByLabel('도착 지점').fill('성산항')
    await legForm.getByLabel('가격').fill('5000')
    await legForm.getByRole('button', { name: '이동 담기' }).click()
    await expect(dayItem(page, '10:30→11:20')).toBeVisible()

    // 익일 도착 게이트 — 확인 전에는 저장하지 않는다 (PRD 엣지)
    await page.getByRole('button', { name: '이동 적기' }).click()
    const nightForm = page.getByTestId('leg-form')
    await nightForm.getByLabel('출발 시각').fill('23:00')
    await nightForm.getByLabel('도착 시각').fill('01:10')
    await nightForm.getByRole('button', { name: '이동 담기' }).click()
    await expect(nightForm.getByRole('alert')).toContainText('다음 날 도착인가요?')
    await expect(dayItems(page)).toHaveCount(4) // 아직 저장되지 않았다
    await nightForm.getByRole('button', { name: '네, 다음 날 도착이에요' }).click()

    // ⑧ 타임라인 — 순서·경고 배지·Day 합계 (FR-008 · 결정 #15·#24)
    await expect(dayItems(page)).toHaveCount(5)
    await expect(dayItems(page)).toContainText([
      '흑돼지 명가',
      '바다뷰 호텔',
      '성산일출봉',
      '10:30→11:20',
      '23:00→01:10 +1일',
    ])
    await expect(
      page.locator('li[data-testid^="day-item-"][data-time-warning="true"]'),
    ).toHaveCount(1)
    await expect(page.getByTestId('day-total')).toHaveText('오늘 17,000원')
  })
})

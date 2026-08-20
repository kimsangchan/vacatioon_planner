// 여러 스펙이 함께 쓰는 화면 조작. 계측 스펙(T8-2)은 여기를 "측정 전 준비"로만 쓰고,
// 측정 구간은 각 스펙이 직접 다룬다 — 준비 과정이 실측값에 섞이면 안 된다.

import { expect, type Locator, type Page } from 'playwright/test'
import { shortPeriod } from '../../src/lib/trips/dates'

export interface NewTripInput {
  name: string
  startDate: string
  endDate: string
}

/** '2026-09-10' → '2026년 9월 10일' (달력 버튼의 접근성 이름) */
function dayLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}

// 달력은 여행 시작 달부터 보여준다 — 목표 달까지 넘긴다
async function goToMonth(page: Page, iso: string): Promise<void> {
  const [year, month] = iso.split('-').map(Number)
  const want = `${year}년 ${month}월`

  for (let hop = 0; hop < 24; hop += 1) {
    if ((await page.getByTestId('calendar-month').textContent())?.trim() === want) return
    await page.getByRole('button', { name: '다음 달' }).click()
  }
  throw new Error(`달력에서 ${want} 로 넘어가지 못했어요`)
}

/** 캔버스 헤더에서 이름을 붙인다 (FR-002 — 새 여행은 이름 없이 시작한다) */
export async function renameTripThroughUi(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /이름 고치기/ }).click()
  await page.getByLabel('여행 이름').fill(name)
  await page.getByRole('button', { name: '이름 저장하기' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

/** 캔버스 헤더의 달력에서 기간을 고른다 (FR-015) */
export async function setTripDatesThroughUi(
  page: Page,
  startDate: string,
  endDate: string,
): Promise<void> {
  await page.getByRole('button', { name: /기간 고치기/ }).click()

  await goToMonth(page, startDate)
  await page.getByRole('button', { name: dayLabel(startDate) }).click()
  await goToMonth(page, endDate)
  await page.getByRole('button', { name: dayLabel(endDate) }).click()

  await page.getByRole('button', { name: '기간 저장하기' }).click()
  await expect(page.getByTestId('trip-dates-form')).toHaveCount(0)

  // 고른 기간이 실제로 붙었는지 확인한다. 이 단언이 없으면 달력이 하루짜리로 접혀도
  // 스모크가 통과한다 — 실제로 그런 결함이 한 번 빠져나갔다
  // 앱과 같은 함수로 문자열을 만든다 — 표기를 줄였을 때(9.10~12) 여기만 옛 형식으로 남아 깨졌다.
  // 정규식 대신 부분 일치를 쓴다: 날짜에 든 마침표를 이스케이프할 일이 없어진다
  const shown = shortPeriod(startDate, endDate)
  await expect(page.getByRole('button', { name: shown, exact: false })).toBeVisible()
}

/**
 * 여행 목록(뎁스 0) → 새 여행 → 캔버스(뎁스 1). 연 캔버스의 trip id 를 돌려준다.
 * 결정 #27 이후 생성은 아무것도 묻지 않는다 — 이름·기간은 캔버스에서 붙인다.
 */
export async function createTripThroughUi(page: Page, input: NewTripInput): Promise<string> {
  await page.getByRole('button', { name: /첫 여행 만들기|새 여행 만들기/ }).click()
  await expect(page.getByLabel('장소 검색')).toBeVisible()

  const tripId = tripIdFromUrl(page)
  await renameTripThroughUi(page, input.name)
  await setTripDatesThroughUi(page, input.startDate, input.endDate)

  return tripId
}

export function tripIdFromUrl(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').pop()
  expect(id).toBeTruthy()
  return id as string
}

/** 검색 → 결과 선택 → 카테고리 확정. SC-001 이 세는 결정 3지점과 같은 순서다 */
export async function savePlaceThroughSearch(
  page: Page,
  input: { query: string; resultName: string; categoryLabel: string },
): Promise<void> {
  await page.getByLabel('장소 검색').fill(input.query)
  await page.getByRole('button', { name: input.resultName }).click()
  await page.getByRole('button', { name: `${input.categoryLabel}으로 담기` }).click()
  await expect(page.getByText(`${input.resultName}을(를) 보관함에 담았어요.`)).toBeVisible()
}

/** 보관함의 한 줄. 이름만으로 role=button 을 찾으면 옆의 "일정에 넣기"까지 걸린다 */
export function storageItem(page: Page, name: string): Locator {
  return page.locator('[data-testid^="place-item-"]').filter({ hasText: name })
}

/** 타임라인의 한 줄 — Stop 은 장소 이름으로, Leg 는 시각 문자열로 찾는다 */
export function dayItem(page: Page, text: string): Locator {
  return page.locator('li[data-testid^="day-item-"]').filter({ hasText: text })
}

export function dayItems(page: Page): Locator {
  return page.locator('li[data-testid^="day-item-"]')
}

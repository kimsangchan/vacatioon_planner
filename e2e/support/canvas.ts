// 여러 스펙이 함께 쓰는 화면 조작. 계측 스펙(T8-2)은 여기를 "측정 전 준비"로만 쓰고,
// 측정 구간은 각 스펙이 직접 다룬다 — 준비 과정이 실측값에 섞이면 안 된다.

import { expect, type Locator, type Page } from 'playwright/test'

export interface NewTripInput {
  name: string
  startDate: string
  endDate: string
}

/** 여행 목록(뎁스 0) → 새 여행 → 캔버스(뎁스 1). 연 캔버스의 trip id 를 돌려준다 */
export async function createTripThroughUi(page: Page, input: NewTripInput): Promise<string> {
  await page.getByRole('button', { name: '첫 여행 만들기' }).click()
  await page.getByLabel('여행 이름').fill(input.name)
  await page.getByLabel('시작하는 날').fill(input.startDate)
  await page.getByLabel('끝나는 날').fill(input.endDate)
  await page.getByRole('button', { name: '여행 만들기', exact: true }).click()

  await page.getByRole('link', { name: input.name }).click()
  await expect(page.getByLabel('장소 검색')).toBeVisible()

  return tripIdFromUrl(page)
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

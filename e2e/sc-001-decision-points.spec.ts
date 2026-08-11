// T8-2 / SC-001 (UX-01) — "검색 진입 → 저장 완료 사용자 결정 지점 ≤3회(검색어 입력·결과 선택·
// 카테고리 확정), 소요 ≤10초" (docs/design/03 §성공 기준).
//
// 스텝 카운트는 두 갈래로 센다.
//   ① 테스트가 의도한 결정 목록 — 무엇을 결정으로 봤는지 코드가 드러낸다
//   ② 브라우저가 실제로 받은 입력(클릭 수 · 타이핑한 필드 수) — 화면이 몰래 요구한 클릭까지 잡힌다
// 둘이 어긋나면 화면 어딘가가 결정을 더 요구한 것이다. 확인 대화(네이티브·ConfirmRow)도 0이어야 한다.

import { expect, test, type Page } from 'playwright/test'
import { signInThroughUi, uniqueE2eEmail } from './support/auth'
import { createTripThroughUi, storageItem } from './support/canvas'
import { stubPlaceSearch } from './support/place-search'
import { dropTrip, signInNode } from './support/seed'

interface InputTally {
  clicks: number
  typedFields: string[]
}

declare global {
  interface Window {
    __inputTally?: InputTally
  }
}

const EMAIL = uniqueE2eEmail('sc001')
const DECISION_LIMIT = 3
const ELAPSED_LIMIT_MS = 10_000

// 화면이 받은 입력을 브라우저 쪽에서 직접 센다 (테스트 스크립트가 세는 것과 별개)
async function countInputs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tally: InputTally = { clicks: 0, typedFields: [] }
    window.__inputTally = tally
    document.addEventListener('click', () => {
      tally.clicks += 1
    }, true)
    document.addEventListener('input', (event) => {
      const target = event.target as HTMLElement
      const key = target.id || target.tagName
      if (!tally.typedFields.includes(key)) tally.typedFields.push(key)
    }, true)
  })
}

test.describe('SC-001 — 검색에서 저장까지 결정 3지점', () => {
  let tripId = ''

  test.afterAll(async () => {
    if (tripId === '') return
    await dropTrip(await signInNode(EMAIL), tripId)
  })

  test('결정 지점 3 · 확인 대화 0 · 소요 10초 이내', async ({ page }, testInfo) => {
    await stubPlaceSearch(page)
    await signInThroughUi(page, EMAIL)
    tripId = await createTripThroughUi(page, {
      name: 'SC-001 계측',
      startDate: '2026-09-10',
      endDate: '2026-09-11',
    })

    // 여기까지가 준비다. 계측은 캔버스가 열린 뒤(검색 진입)부터 시작한다
    let dialogs = 0
    page.on('dialog', (dialog) => {
      dialogs += 1
      void dialog.dismiss()
    })
    await countInputs(page)

    const decisions: string[] = []
    const decide = async (label: string, action: () => Promise<void>) => {
      decisions.push(label)
      await action()
    }

    const startedAt = Date.now()

    await decide('검색어 입력', () => page.getByLabel('장소 검색').fill('흑돼지'))

    const result = page.getByRole('button', { name: '흑돼지 명가' })
    await expect(result).toBeVisible() // 결과를 기다리는 건 결정이 아니다
    await decide('결과 선택', () => result.click())

    const category = page.getByRole('button', { name: '식당으로 담기' })
    await expect(category).toBeVisible()
    // 결과 선택과 카테고리 확정 사이에 확인 줄(ConfirmRow)이 끼지 않는다.
    // 범위를 main 으로 좁힌다 — dev 오버레이가 body 끝에 제 알림을 붙인다
    await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0)
    await decide('카테고리 확정', () => category.click())

    await expect(page.getByText('흑돼지 명가을(를) 보관함에 담았어요.')).toBeVisible()
    const elapsedMs = Date.now() - startedAt

    const tally = (await page.evaluate(() => window.__inputTally)) as InputTally
    const countedDecisions = tally.clicks + tally.typedFields.length

    testInfo.annotations.push({
      type: 'SC-001',
      description: `결정 ${countedDecisions}지점(클릭 ${tally.clicks} + 입력 필드 ${tally.typedFields.length}) · ${elapsedMs}ms · 확인 대화 ${dialogs}`,
    })
    console.log(
      `[SC-001] 결정 지점 ${countedDecisions} (클릭 ${tally.clicks}, 입력 필드 ${tally.typedFields.join(', ')}) · 소요 ${elapsedMs}ms · 확인 대화 ${dialogs}건`,
    )

    expect(decisions).toEqual(['검색어 입력', '결과 선택', '카테고리 확정'])
    expect(tally.typedFields).toEqual(['place-search'])
    expect(tally.clicks).toBe(2)
    expect(countedDecisions).toBe(DECISION_LIMIT)
    expect(dialogs).toBe(0)
    expect(elapsedMs).toBeLessThanOrEqual(ELAPSED_LIMIT_MS)

    // 결정 3지점이 실제로 저장까지 갔다 — 보관함에 한 줄 (E-04)
    await expect(storageItem(page, '흑돼지 명가')).toHaveCount(1)
  })
})

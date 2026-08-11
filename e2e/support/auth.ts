// FR-001 인증. 브라우저에서 실제 로그인 화면을 거친다 — 코드 입력이 기본이고 매직링크는
// 보조다 (decision-log #13). 코드는 로컬 Mailpit 에서 꺼낸다: vitest integration 이 쓰는
// src/test-support/supabase-local.ts 를 그대로 재사용한다.
//
// 테스트 유저는 e2e-* 네임스페이스다 — 로컬 auth.users 에서 이 작업이 만든 계정을 알아볼 수 있어야 한다.

import { expect, type Page } from 'playwright/test'
import { mailpitMessageIds, waitForOtpCode } from '../../src/test-support/supabase-local'

export function uniqueE2eEmail(label: string): string {
  return `e2e-${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}@example.com`
}

/** 처음 보는 주소면 이 한 번이 곧 가입이다 (signInWithOtp 가 계정을 만든다) */
export async function signInThroughUi(page: Page, email: string): Promise<void> {
  // 노드 시드가 먼저 로그인했을 수 있다 — 그때 온 코드는 이미 무효라 빼고 기다린다
  const seen = await mailpitMessageIds(email)

  await page.goto('/login')
  await page.getByLabel('이메일 주소').fill(email)
  await page.getByRole('button', { name: '인증 코드 받기' }).click()

  const code = await waitForOtpCode(email, 20_000, seen)
  await page.getByLabel('6자리 인증 코드').fill(code)
  await page.getByRole('button', { name: '코드 확인하기' }).click()

  // 로그인 뒤 도착지는 여행 목록(뎁스 0)이다 (FR-014)
  await expect(page.getByRole('heading', { name: '내 여행' })).toBeVisible()
}

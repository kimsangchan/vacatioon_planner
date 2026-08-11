// T8 — E2E 설정. 스펙은 e2e/ 아래에만 두어 vitest(include: `src/**/*.test.{ts,tsx}`)와 겹치지
// 않게 한다. 두 러너가 같은 파일을 집으면 둘 다 못 믿는다.
//
// dev 서버 포트는 3010 고정이다 (CLAUDE.md 함정 — 3000은 사용자의 다른 앱, 지도 인증도 포트까지 본다).
// 로컬 Supabase 는 이미 떠 있는 것을 그대로 쓴다 — E2E 가 재시작하지 않는다(사용자 실데이터 보존).

import { defineConfig, devices } from 'playwright/test'
import { loadEnv } from 'vite'

// 로컬 Supabase·Mailpit 주소의 진실은 .env.local 이다 (vitest.config.ts 와 같은 경로).
// 노드 쪽 시드·OTP 헬퍼(src/test-support/supabase-local.ts)가 이 값을 읽는다.
Object.assign(process.env, loadEnv('development', process.cwd(), ''))

export const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3010'

export default defineConfig({
  testDir: './e2e',
  // 로컬 Supabase·Mailpit 한 벌을 공유하므로 한 줄로 돈다. 재시도는 0 — 흔들림을 감추지 않는다
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `${E2E_BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})

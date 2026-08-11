# e2e/ — 스코프 작업 지침

이 폴더의 파일을 다룰 때만 로드된다(온디맨드). 공통 행동규칙은 루트 `CLAUDE.md`,
프로젝트 표준·네비게이션은 `AGENTS.md`, 다음-할일은 `NEXT.md`를 따른다.

## 목표

여정 1 스모크 + 성공기준(SC) 계측을 실브라우저로 증명한다. tasks.md T8의 산출물.

## 소유 경로

`journey-first-trip.spec.ts` · `sc-001-decision-points.spec.ts` ·
`sc-002-preview-latency.spec.ts` · `sc-004-timeline-viewport.spec.ts` · `support/`(auth·canvas·images·place-search·seed)
읽기 전용 입력: `docs/design/06-test-design.md`(SC 변환표·부록 체크리스트) · `playwright.config.ts`

## 핵심 관례

- **dev 서버 포트 3010 고정.** baseURL·NCP 등록 URL·`supabase/config.toml` site_url이 모두 3010이어야 한다
- 로컬 Supabase(`npx supabase start`)와 dev 서버가 **먼저 떠 있어야** 한다
- 인증은 OTP 코드 — Mailpit API로 코드를 취득한다(`support/auth.ts`)
- SC 어서션 기준: SC-001 스텝 카운트 · SC-002 400ms trace · SC-004 390×844 스크린샷
- 실키(NCP 검색)에 의존하는 단언을 넣지 마라 — 쿼터·네트워크로 flaky해진다. `support/place-search.ts`로 통제
- 임시·정찰용 스펙(`zz-*`)은 커밋 전에 지운다

## 검증

`npm run test:e2e` green + `docs/design/06` 부록 체크리스트 → 결과를 `tasks.md` T8에 체크

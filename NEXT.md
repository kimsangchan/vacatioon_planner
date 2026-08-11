<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

- **[진행중] T8-1·T8-2 E2E 계측** — `e2e/` 4스펙 + `playwright.config.ts` + `app/not-found.tsx`가
  아직 미커밋. 다음 한 걸음: `npx supabase start` → dev(3010) 기동 → `npm run test:e2e` 전체 green
  확인 → 임시 스펙 `e2e/zz-tmp-recheck.spec.ts` 정리 → T8 증분 커밋.
  앵커: `tasks.md` T8 · `e2e/journey-first-trip.spec.ts` · 직전 커밋 `487329e`
- **[다음] T8-3** — SC-003 뎁스·CTA 체크리스트 수동 검수(`docs/design/06` 부록) → 결과를 `tasks.md`에 체크
- **[대기·사용자 작업] T0-2 · T0-3** — NCP Maps 무료 이용량 확인(미적용 시 카카오 폴백 =
  `docs/design/08` 잔여우려 1) · Supabase 원격 프로젝트 생성 + 메일 템플릿 교체. **T9 배포의 블로커**
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일" 1~3건만. 짧게(화면 한 판).
- 완료된 항목은 여기 두지 말고 WORKLOG.md 의 ## History 로 옮긴다 (단일 출처·비대 방지).
- 전체 작업 목록·백로그(T5-3, T7-4, T1-4 등)는 tasks.md 가 원본 — 여기 복사하지 않는다.
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

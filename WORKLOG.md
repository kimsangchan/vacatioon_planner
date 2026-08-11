# WORKLOG — Trip Canvas

세션/에이전트 간 핸드오프 로그. **"다음 할 일"은 여기 쓰지 않는다 → `NEXT.md`.**
전체 작업 목록·완료 기준은 `tasks.md`가 원본. 여기는 결과 요약만 append.

## Current State

- Status: blocked (사용자 작업 대기)
- Focus: T8 완료·T0-2 검증 완료. 다음은 T9 배포지만 **T0-3(Supabase 원격 + 메일 템플릿)** 이 선행 — 사용자 작업
- 검증 기준선: vitest 290(37파일) · pgTAP 136 · E2E 5테스트 · `npm run build`/`lint` 종료코드 0
- Last updated: 2026-08-11

## History (append; 최신이 위)

- 2026-08-11 — **T0-2 완료**: NCP Maps 실키가 3010에서 인증 성공함을 실브라우저로 검증
  (SDK 네임스페이스·타일 56장·fake/실패 배너 0건, 제주 지도+핀 육안 확인). 무료 이용량은 월 600만 건(대표 계정).
  **카카오 폴백 불필요 — 08 잔여우려 1 해소**(결정 #25). `MapProvider` 추상화와 provider enum의 kakao는 유지
- 2026-08-11 — **T8 완료**: E2E 4스펙 green(여정 1 스모크 18.7s). SC 실측 — SC-001 결정 3지점·1106ms·
  확인 대화 0 / SC-002 호버→카드 중앙값 30ms(≤400) / SC-004 390×844 전 Leg 시각 1스크롤 내(681px).
  T8-3 SC-003 체크리스트 5항목 전부 ✓ (강조 CTA는 12개 상태 전수 측정 전부 ≤1, 에러 화면 2종 다음 행동 버튼 확인).
  계측용 임시 스펙 `zz-tmp-recheck.spec.ts`는 실행 후 삭제
- 2026-08-11 — catch-up 컨텍스트 구조 도입: `AGENTS.md` 단일 원본화, 루트 `CLAUDE.md`는 행동규칙만,
  `NEXT.md`/`WORKLOG.md` 분리, 스코프 4종(`src/lib`·`src/components`·`supabase`·`e2e`) CLAUDE.md,
  SessionStart 훅 배선
- 2026-08-07 — `487329e` T7-3: Leg 예매 캡처 첨부·기간 변경(축소 확인)·삭제/되돌리기(Trip 소프트 90일 복구)
  + dev 포트 3010 전환. vitest 280 · pgTAP 136 · 실브라우저 ⓐⓑⓒ 확인
- 2026-08-07 — `1dae68f` T7-1·2: 일정 배치·타임라인(통합 position 병합)·이동 입력·방문 지출.
  Day 지출 합계 = Stop+Leg (결정 #24) · `0005_stop_cost.sql`
- 2026-08-07 — `ce5c76f` T6-B: 사진 미리보기·업로드·수동 등록 + **지도 인증 실패 시 앱 크래시 수정**
  (`navermap_authFailure` 구독, 회귀 3건)
- 2026-08-07 — `002b354` T6-A: 캔버스 코어 — 지도 추상화(`MapProvider`)·검색 저장·리스트↔핀 동기화.
  클러스터링은 보류
- 2026-08-07 — `51eae38` T4 누락분(trips 데이터 계층) · `c1bde13` T5 검색 프록시 ·
  `76455c5` T4 OTP 인증·여행 목록. 카테고리 어휘 실측 정정(결정 #23)
- 2026-08-06 — `9fba3b6` T3: DB 스키마·RLS·RPC 9종 + pgTAP 104어서션 ·
  `76d39a1` T2: 순수 도메인 로직 4종(테스트 우선) · `08eda94` 기반(설계 패키지·SPEC·tasks)
- 2026-08-06 — 설계 패키지 확정(service-autopilot 8단계, GATE 2회 통과) → `docs/design/`.
  T0-4 실측: 검색 API HUB는 WGS84×10⁷ 반환(결정 #20)

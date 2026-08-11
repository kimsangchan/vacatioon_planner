<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

- **[대기·사용자 작업] T0-2 · T0-3 — T9의 블로커**
  ⓐ NCP 콘솔 Maps(Web Dynamic Map) 신규 계정 **무료 이용량 적용 여부 확인** —
  미적용이면 카카오 폴백 결정(`docs/design/08` 잔여우려 1). 콘솔 Maps 앱에 `http://localhost:3010` 등록도 함께.
  ⓑ Supabase 원격 프로젝트 생성 + Auth 메일 템플릿 교체(`supabase/templates/magic_link.html`과 동일 형식 —
  본문에 `{{ .Token }}` 6자리 코드). 기본 템플릿엔 코드가 없어 FR-001이 불성립한다.
- **[다음] T9-1** — Vercel 프로젝트 연결 + env 등록 + Preview 배포 → 실기기(아이폰) 육안 확인.
  T0 완료 후 착수. 앵커: `tasks.md` T9 · `docs/design/07-ops-design.md`
- **[백로그, 착수 전 판단]** T5-3(업스트림 장애 시 stale 캐시 — `get_stale_search` RPC) ·
  T7-4(P2 공유 착수 시 `get_shared_trip`에 `cost_amount` 추가) — 상세는 `tasks.md`
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일" 1~3건만. 짧게(화면 한 판).
- 완료된 항목은 여기 두지 말고 WORKLOG.md 의 ## History 로 옮긴다 (단일 출처·비대 방지).
- 전체 작업 목록·백로그의 원본은 tasks.md — 여기 복사하지 않는다(위는 포인터만).
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

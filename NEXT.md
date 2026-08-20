<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

**MVP 배포됨**: https://vacatioon-planner.vercel.app
검증 기준선: vitest **552** · pgTAP **213** · E2E 4 · tsc 0 · lint 0 (2026-08-20 실측)

### ⚠️ 배포 전에 반드시 — 원격 Supabase 에 `0013`·`0014` 선적용

운영에는 **`0012` 까지만** 들어가 있다. 이 두 개를 먼저 넣지 않고 배포하면 깨진다:
- `0013` 없이 → 별점 4·5 를 누르면 CHECK 위반
- `0014` 없이 → 장소 저장이 `phone` 컬럼을 못 찾아 실패

**적용 방법**(CLI 로그인 없이 한 것): `.env` 의 `SUPABASE_PROJECT_REF`·`SUPABASE_DB_PASSWORD` 로
`aws-0-ap-northeast-2.pooler.supabase.com:5432` / user `postgres.<ref>` 에 psql 접속.
`db.<ref>.supabase.co` 는 **IPv6 전용**이라 도커 컨테이너에서 못 붙는다.
적용 뒤 `supabase_migrations.schema_migrations` 에 버전 행도 함께 넣어야 CLI 가 어긋나지 않는다.

### 눈으로 확인 못 한 것 (가장 먼저 할 일)

방금 카드를 크게 바꿨는데 **실브라우저로 못 봤다**(브라우저 MCP 가 두 번 멈춰서). 유닛·E2E 는 통과.
- **PC**: 핀을 누르면 짧은 말풍선 → `자세히` → 좌측 패널 상세. 지도를 끌면 말풍선이 따라오나
- **모바일(390×844)**: 핀을 누르면 아래에서 시트. 하단 메뉴를 덮지 않나
- 카드가 **읽기로** 뜨고 연필로 열리나 · 별 다섯 개가 폭에 드나

### 다음

- **[다음] 실브라우저 확인 → 원격 마이그레이션 → 배포**
- T10-5b 도보 이동시간 — 외부 API 없이 좌표 거리로 추정. 지금은 "차로 …" 한 줄뿐
- T10-6 검색 결과 5건 상한 — 카카오 Local 전환이 유일한 길. 콘솔 차단은 이미 풀렸다
- **[버그] T10-7** 로그인 직후 홈이 500 — `JWT issued at future`. 컨테이너 시계 1초 차로
  `getUser()` 는 통과하고 PostgREST 만 거부해 결정 #31 의 그물에 안 걸린다. L-06 위반

### 알아 두면 시간 아끼는 것

- **통합 테스트는 vitest projects 로 갈라 놨다**(unit 병렬 / integration 직렬). 산발적 실패는 해결됐다
- **dev 서버를 켜 둔 채 `npm run build` 금지** — `.next` 가 깨져 타입 에러처럼 보인다 (푸시 훅이 build 를 돈다)
- **`db reset` 은 로컬을 다 지운다.** 이번에 세 번 겪었다 — 백업 먼저
- 브라우저 MCP(`plugin:ecc:playwright`)가 응답 없이 멈추는 일이 잦다. E2E 는 자체 Playwright 라 멀쩡하다
- Vercel CLI 는 로그인돼 있고 프로젝트도 링크됐다. `NCP_MAP_CLIENT_SECRET` 은 Production·Preview 등록 완료

### 함정은 그 폴더의 CLAUDE.md 에 있다

`src/components/CLAUDE.md` · `supabase/CLAUDE.md` · `e2e/CLAUDE.md` · `AGENTS.md`
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일"만. 완료분은 WORKLOG.md 의 ## History 로.
- 전체 작업 목록의 원본은 tasks.md, 결정 근거는 docs/design/decision-log.md (#45까지).
- **근거를 여기에만 적지 마라.** 이 블록은 개정 때 통째로 갈린다 — "왜 길찾기만 카카오냐"가 여기
  적혔다가 사라졌고, 되찾고 보니 **그 근거 자체가 틀렸다**(2026-08-20 콘솔 실측). 근거는 decision-log 로,
  그리고 **검증한 날짜와 방법을 함께** 적어라.
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

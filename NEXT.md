<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

**MVP 배포됨**: https://vacatioon-planner.vercel.app
검증 기준선: vitest **456 passed** · pgTAP **185** · E2E 4 · tsc 0 · lint 0

**2026-08-18 작업분 운영 반영 완료** (`3a88c8d`). 원격 Supabase 에
`0008_place_estimated_cost.sql`·`0009_day_color.sql` 을 먼저 적용한 뒤 Vercel Production 배포 성공.

### 방금 끝낸 것 (사용자 피드백, tasks.md T10)
- T10-1 검색 결과 잘림 — 결과 도착 시 시트 확장
- T10-2 장소 카드를 **핀에 붙는 팝업**으로 (결정 #40). 지도 이동·확대축소를 따라간다
- T10-3 **예상 금액 + 경비 요약** (결정 #39). 확정/예상 포함 두 줄, 보관함은 소계만
- T10-4 **일차별 색상** (결정 #41). 색=일차 / 모양=카테고리 로 채널을 갈랐다
- T10-8 **모바일 재구성** (결정 #42·#43). 하단 메뉴(지도·보관함·일정) · 상단 상주 검색 ·
  지도 전체화면 · 카드에서 일정 넣기/빼기 · 배지 세로 접힘 수정

### 다음 (사용자가 준 순서)
- **[다음] T10-5 이동시간(자동차·도보)** — 카카오모빌리티 Directions.
  **사용자 작업 선행**: 카카오 개발자 콘솔 → Vacation Planner → 카카오맵 활성화 ON
  (지금은 `403 disabled OPEN_MAP_AND_LOCAL service`). 도보는 외부 API 없이 좌표 거리로 추정.
  대중교통은 공개 API 가 없어 ODsay 등 별도 가입이 필요 — 사용자가 원하면 그때
- **[그다음] T10-6 검색 결과 5건 상한** — 네이버 지역검색은 `display` 최대 5·`start` 무시(실호출 확정).
  더 긴 목록·좌표 반경 검색·전화번호 저장(구 A·C)은 **카카오 Local 전환**이 유일한 길.
  **지도는 네이버 그대로 두고 검색 백엔드만** 바꾸는 것이다(`places.provider` 에 'kakao' 이미 있음, #16)
- **[버그] T10-7** 로그인 직후 홈이 500 — `JWT issued at future`. 컨테이너 시계 1초 차로
  `getUser()` 는 통과하고 PostgREST 만 거부해서 결정 #31 의 그물에 안 걸린다. L-06 위반(막다른 화면)

### 사용자 몫으로 남은 것
- 카카오 개발자 콘솔에서 **카카오맵 활성화** (T10-5·T10-6 이 여기서 막혀 있다)
- 실기기(아이폰)에서 배포본 육안 확인
- GitHub Secrets 에 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 등록 → keepalive 가동

### 함정 (여기서 시간을 크게 잃었다)
- **jsdom 에는 레이아웃이 없다.** "DOM 에 있다"만 단언하면 화면 밖으로 잘린 결함이 그대로 통과한다.
  실제로 카드가 안 보인다는 신고를 테스트 3번이 연속으로 놓쳤다 — 위치·부모·시트 높이로 단언하라.
- **지도 SDK 의 `fromCoordToOffset` 은 월드 픽셀이다**(화면 좌표 아님). 뷰포트 북서 모서리를 빼야 한다.
  유닛 테스트로는 절대 못 잡는다 — 브라우저에서 실제로 끌어 봐야 나온다.
- **`h-full` 은 flex 아이템 안에서 퍼센트 기준이 확정되지 않는다** — 지도 컨테이너가 0px 이 되어
  지도가 **백지**로 뜬다. 부모를 `relative` 로 두고 `absolute inset-0` 로 채워라 (두 번 겪었다).
- 같은 컴포넌트를 반응형으로 두 벌 두지 마라 — `id` 하드코딩이 있으면 문서에 같은 id 가 둘 생겨
  라벨이 엉뚱한 입력에 붙는다 (`PlaceSearchBox` 의 `id="place-search"`).
- **dev 서버를 켜 둔 채 `npm run build` 금지.** `.next` 가 깨져 "코드 문제처럼 보이는" 증상이 난다.
- dev 서버·사용자 사용과 vitest integration 이 **같은 로컬 Supabase 를 두고 경합**한다.
  5초 타임아웃으로 우수수 깨지면 코드 문제가 아니다 — 단독으로 다시 돌려 보라.
- **오래 떠 있던 dev 서버는 `/trip/[id]` 를 `Rendering…` 에서 멈춰 세운다.** 코드 문제로 착각하기 쉽다 —
  포트를 잡은 프로세스를 죽이고 `.next` 를 지운 뒤 Playwright 가 직접 띄우게 하라 (실제로 또 겪었다).
- **`supabase db reset` 은 로컬 데이터를 지운다.** 실제 기록은 로컬에 만들지 말 것.
- lockfile 은 **리눅스에서** 만들어야 CI 가 통과한다.
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일"만. 완료분은 WORKLOG.md 의 ## History 로.
- 전체 작업 목록의 원본은 tasks.md, 결정 근거는 docs/design/decision-log.md (#41까지).
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

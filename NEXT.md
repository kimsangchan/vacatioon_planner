<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

**MVP 배포됨**: https://vacatioon-planner.vercel.app
검증 기준선: vitest **591**(unit 538 · integration 53) · pgTAP **214** · **E2E 5** · tsc 0 · lint 0
(2026-08-21 실측). 원격 Supabase 는 **`0014` 까지 적용됨**

### 검색은 여기까지다 — 더 파지 마라 (결정 #56)

네이버 지역검색은 **서버가 5건으로 자른다**. 실호출로 재확인했다(2026-08-21):
`display=30` 도 `"display":5,"total":5` · "카페"도 total 5 · `start=6` 무시 · `sort=comment` 도 5.
`total` 자체가 5라 "5개밖에 없다"가 아니라 **"5개만 준다"** 이다.

**카카오 Local 전환은 약관으로 기각했다** — 타사 지도에 타사 POI 혼용은 위반 소지(01-recon §지도 API 약관).
카카오 검색을 네이버 지도에 찍는 것이 정확히 그 조합이다. 지도까지 함께 카카오로 가면 약관은 깨끗하고
결정 #2 덕에 교체 지점도 `lib/map/naver.ts` 한 파일이지만, **정말 답답해지기 전에는 가지 않는다**.

지금 있는 것: 검색 버튼(엔터=submit) · 받은 5건을 지도 중심 거리순 정렬 · 거리 표기 (#55).

### 아직 눈으로 못 본 것

E2E 가 390×844 에서 교체·별점 크기를 실측했지만(SC-004 파일), 아래는 여전히 사람 눈이 필요하다:
- **PC**: 핀을 누르면 짧은 말풍선 → `자세히` → 좌측 패널 상세. 지도를 끌면 말풍선이 따라오나
- 타임라인 행에서 `⋯` → `다른 곳으로 바꾸기` → 후보에 마우스를 올리면 지도 핀이 강조되나
- 검색 결과의 거리 표기가 실제 지도 중심과 맞나 (`viewCenter()` 는 bounds 중점이다)

### 다음

- T10-5b 도보 이동시간 — `lib/geo/distance.ts`(하버사인)가 이번에 생겼다. 그걸 쓰면 된다
- **[버그] T10-7** 로그인 직후 홈이 500 — `JWT issued at future`. 컨테이너 시계 1초 차로
  `getUser()` 는 통과하고 PostgREST 만 거부해 결정 #31 의 그물에 안 걸린다. L-06 위반
- 커밋 안 됨 — T10-20~25 가 작업 트리에 그대로 있다 (커밋·푸시는 사용자 요청 시에만)

### 알아 두면 시간 아끼는 것

- **교체의 실체는 `stops.place_id` 한 칸이다** (결정 #53). 마이그레이션이 없다 —
  `updateStop` 이 이미 PostgREST 직접 PATCH 이고 RLS 는 day 소유권만 본다.
  경로·이동시간은 `use-day-route` 가 좌표 문자열을 키로 써서 **저절로** 다시 계산된다
- **통합 테스트는 vitest projects 로 갈라 놨다**(unit 병렬 / integration 직렬)
- **dev 서버를 켜 둔 채 `npm run build` 금지** — `.next` 가 깨져 타입 에러처럼 보인다
- **`db reset` 은 로컬을 다 지운다** — 백업 먼저
- E2E 는 자체 Playwright 라 멀쩡하다. 브라우저 MCP(`plugin:ecc:playwright`)는 자주 멈춘다
- 원격 psql 은 풀러(`aws-0-ap-northeast-2.pooler.supabase.com:5432`)로 붙는다.
  `db.<ref>.supabase.co` 는 IPv6 전용이라 도커에서 안 된다. psql 은 로컬 도커 이미지
  `public.ecr.aws/supabase/postgres` 안에 있다

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

<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

**MVP 배포됨**: https://vacatioon-planner.vercel.app
검증 기준선: vitest **490 passed**(54 파일) · pgTAP 185 · E2E 4 · tsc 0 · lint 0
— 2026-08-20 실측. 아래 미커밋 T10-5 를 **포함한** 수치다

### 지금 손에 있는 것 — T10-5 이동시간, 작업 트리에 미커밋

구현이 이미 들어와 있다. 테스트 44건 통과. 아직 커밋되지 않았다:
`src/app/api/directions/route.ts` · `src/lib/route/{directions-proxy,format,use-day-route}.ts` ·
`src/lib/timeline/route.ts`(+ 각 테스트) · `src/components/canvas/TimelinePane.tsx` 수정

- 카카오모빌리티 **경유지 길찾기를 일차당 한 번** 부른다. 키는 서버 전용 (`KAKAO_REST_API_KEY`)
- 사이에 적어 둔 이동(Leg)이 있는 구간은 추정치를 내지 않는다 — 기록이 추정보다 세다
- 근거는 **결정 #45** (`docs/design/decision-log.md`)

**커밋 전에 남은 것**
1. `tasks.md` T10-5 완료 기준 대조 후 `[x]`
2. **도보는 아직 없다** — 화면 문구가 "차로 …" 하나뿐이다. 좌표 거리 추정을 넣을지 정할 것
3. **실키로 실제 호출이 되는지 확인 안 됨** — 이전에 `403 disabled OPEN_MAP_AND_LOCAL service` 를 겪었다.
   카카오 개발자 콘솔에서 카카오맵이 켜져 있어야 한다(아래 사용자 몫)
4. 실브라우저 확인 — 이 프로젝트에서 유닛 테스트가 놓친 결함이 반복해서 나왔다

### 다음

- **T10-6 검색 결과 5건 상한** — 네이버 지역검색은 `display` 최대 5·`start` 무시(실호출로 확정).
  더 긴 목록·좌표 반경 검색·전화번호 저장은 **카카오 Local 전환**이 유일한 길.
  **지도는 네이버 그대로 두고 검색 백엔드만** 바꾼다(`places.provider` 에 'kakao' 이미 있음, #16)
- **[버그] T10-7** 로그인 직후 홈이 500 — `JWT issued at future`. 컨테이너 시계 1초 차로
  `getUser()` 는 통과하고 PostgREST 만 거부해서 결정 #31 의 그물에 안 걸린다. L-06 위반(막다른 화면)

### 사용자 몫으로 남은 것

- 카카오 개발자 콘솔에서 **카카오맵 활성화** — T10-5 실호출 확인과 T10-6 이 여기에 걸려 있다
- 실기기(아이폰)에서 배포본 육안 확인
- GitHub Secrets 에 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 등록 → keepalive 가동

### 함정은 그 폴더의 CLAUDE.md 에 있다

여기서 시간을 크게 잃은 함정들은 읽힐 자리로 내렸다 — 그 폴더를 만질 때 읽어라.
`src/components/CLAUDE.md`(jsdom 레이아웃·지도 투영·`h-full`·포인터 캡처·id 중복) ·
`supabase/CLAUDE.md`(`db reset` 데이터 삭제·테스트 경합) ·
`e2e/CLAUDE.md`(오래 뜬 dev 서버·`.next`·`npm run build`)
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일"만. 완료분은 WORKLOG.md 의 ## History 로.
- 전체 작업 목록의 원본은 tasks.md, 결정 근거는 docs/design/decision-log.md (#45까지).
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

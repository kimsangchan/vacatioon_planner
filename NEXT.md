<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

**MVP 완성·배포됨**: https://vacatioon-planner.vercel.app (카카오 로그인·실지도·실키 검색 운영 검증 완료)
검증 기준선: vitest 400 · pgTAP 158 · E2E 4 · CI 전체 초록 · 커밋은 `origin/master`에 동기화됨

사용자가 정한 다음 순서는 **B → A → C → D**다.

- **[다음] B. 예상 금액 + 여행 전체 경비 요약**
  ① 보관함 단계(Place)에도 예상 금액 — **결정 #24를 다시 여는 것**이다. 그때는 "보관함 가격은
  확정 전 추정치라 memo가 적절"이라 뺐는데, 사용자가 "식당 예상 금액을 저장해 경비 계산에 쓰고 싶다"고
  요청했다. 실제 지출(`stops.cost_amount`)과 **구분**해야 한다(예상 vs 실제).
  ② 여행 전체 합계 — 지금은 일차별 합계만 있다(`lib/timeline/merge.ts`, TimelinePane 하단).
  새 마이그레이션(0008)으로 컬럼 추가 · pgTAP 먼저 · 금액은 원 단위 정수(#17).
- **[그다음] A. 검색이 주는데 버리는 값 저장** — 네이버 지역검색 응답의 `telephone`·`description`을
  `toNormalizedPlaces`가 버린다(`lib/place/search-proxy.ts`). places 테이블에 컬럼 추가 + 미리보기 카드 표시.
- **[그다음] C. 지도에서 찍기 → 주변 업체 목록** — 지금 네이버 지역검색 API는 **키워드 전용**이라
  좌표·반경 검색이 안 된다. **카카오 Local API**가 좌표+반경+카테고리를 지원하고 카카오 REST 키는 이미 있다.
- **[그다음] D. 경유지 포함 이동경로** — NCP Directions 5/15가 경유지 5·15개, 거리·시간·**통행료·유류비**를 준다.
  단 **무료 이용량 없음**(무료는 Web Dynamic Map·Static Map·Geocoding·Reverse Geocoding까지).
  대안은 카카오모빌리티 길찾기(별도 신청, 무료 쿼터 있음). B의 경비 계산과 이어진다.

### 사용자 몫으로 남은 것
- 실기기(아이폰)에서 배포본 육안 확인
- GitHub Secrets에 `SUPABASE_URL`·`SUPABASE_ANON_KEY` 등록 → keepalive 가동(무료 티어 일시정지 방지)
- 메일 템플릿(`{{ .Token }}`)은 **보류** — 카카오를 주 경로로 쓰기로 함

### 함정 (여기서 시간을 크게 잃었다)
- **dev 서버를 켜 둔 채 `npm run build` 금지.** `.next`가 깨져 "코드 문제처럼 보이는" 증상이 난다(세션 중 4회).
  E2E가 무더기로 깨지면 먼저 dev를 내리고 `.next` 지운 뒤 Playwright가 서버를 띄우게 하라 (`e2e/CLAUDE.md`).
- **`supabase db reset`은 로컬 데이터를 지운다.** 실제 기록은 로컬에 만들지 말 것.
- E2E는 검색 API를 **스텁**한다 — 브라우저의 진짜 검색 경로는 덮이지 않는다. 그 틈으로 버그가 운영까지 나갔다.
- lockfile은 **리눅스에서** 만들어야 CI가 통과한다(Windows 생성본은 리눅스용 optional 의존성을 빠뜨린다).
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일"만. 완료분은 WORKLOG.md 의 ## History 로.
- 전체 작업 목록의 원본은 tasks.md, 결정 근거는 docs/design/decision-log.md (#38까지).
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

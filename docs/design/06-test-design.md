# 테스트 설계 — Trip Canvas

작성 2026-08-06 · 입력: 03-prd(SC·FR·엣지케이스), 04(위협모델), 05(계약)

## 원칙

- AC는 개발 시작 전에 존재하고, 각 시나리오는 처음엔 반드시 실패한다 (TDD 게이트)
- 피라미드 ~70/20/10: unit(좌표 변환·시간 병합·정규화) 다수 → integration(RLS·프록시) → contract(E-03·E-11 스키마) → E2E 최소
- 하위 층에서 검증된 것을 상위에서 반복하지 않는다 (Fowler)
- 도구(확정): Vitest(unit) · Supabase 로컬 + pgTAP(RLS 정책 — 마이그레이션과 같은 SQL 계층이라 채택, GATE M-3 해소) · Playwright(E2E — SC-002 계측 포함)

## 수용 기준 → 시나리오 변환표

| SC/FR | Gherkin 시나리오 | 레이어 | 데이터/목킹 |
|---|---|---|---|
| FR-001 | Given 미인증, When 이메일 제출, Then 매직링크+6자리 코드 발송, 링크 클릭 또는 코드 입력 어느 쪽으로도 세션 생성 (PWA 기본 = 코드 입력) | E2E(스모크) | Supabase 로컬 inbucket |
| FR-002 | Given 8/1~8/3 입력, When Trip 생성, Then Day 3개(position 0..2) 자동 생성 | integration | 로컬 DB |
| FR-002 실패 | Given end<start, When 생성, Then `validation/date-range` 문제 응답 | unit(검증)+integration | — |
| FR-003 | Given 프록시 목킹 응답(mapx/mapy KATECH), When "성산일출봉" 검색·선택·spot 확정, Then WGS84로 저장·보관함 표시 | integration | 네이버 응답 픽스처 |
| FR-003 변환 | Given KATECH 좌표 픽스처 5종(서울·제주·경계값), When 변환, Then 기대 WGS84 오차 <1e-5 | unit | proj4 픽스처 |
| FR-003 엣지 | Given 검색 0건, Then 대안 안내(지도 롱프레스 진입) 표시 / Given 업스트림 500, Then 캐시 폴백+안내 / Given 일 쿼터 소진, Then 429·검색 차단 안내 | unit+integration | 프록시 목킹 3종 |
| FR-004 | Given 4032px 사진, When 첨부, Then 클라 리사이즈 1600px WebP·업로드·is_cover 지정 | integration | 이미지 픽스처 |
| FR-004 실패 | Given 3MB 초과·비이미지 MIME, When 업로드, Then `storage/too-large`·`storage/bad-mime` | contract | — |
| FR-005 | Given 카테고리별 Place 3종, When 캔버스 로드, Then 핀 3색 표시·리스트 항목 호버 시 해당 핀 강조(상호) | E2E | 시드 Trip |
| FR-006 / SC-002 | Given 썸네일 프리페치 완료, When 핀 호버, Then 카드 표시 지연 ≤400ms (Playwright trace 계측) | E2E(계측) | 시드 Trip |
| FR-006 엣지 | Given 사진 없는 Place, When 호버, Then 플레이스홀더+"사진 추가" 버튼 | integration(컴포넌트) | — |
| FR-007 | Given 보관함 Place, When Day1로 배치·순서 변경, Then position 배열 저장·재로드 후 유지 | integration | — |
| FR-015 | Given Day2에 Stop 2개, When 기간 축소(`update_trip_dates` RPC), Then 단일 트랜잭션으로 Day 삭제·Stop 제거·Place 보관함 복귀·복귀 개수 반환 (중간 실패 시 전체 롤백) | integration | — |
| FR-014 | Given Trip 2개(1개 soft delete), When 홈 진입, Then 목록에 살아있는 1개만 이름·기간·장소 수 표시 | integration | 시드 |
| FR-016 | Given 검색 0건 안내에서 "지도에 직접 찍기" 진입, When 지도 롱프레스·이름 입력, Then provider=manual·provider_link null로 저장·핀 표시 | E2E | — |
| FR-017 | Given Trip 삭제, When 90일 내 되돌리기, Then deleted_at 해제·캔버스 복원 / Given Stop·Leg 삭제, Then 즉시 hard delete 확인 | integration | — |
| FR-018 | Given Leg에 예매 캡처 첨부, When 저장, Then 리사이즈 파이프라인 경유·타임라인 카드에 썸네일 표시 / Given place_id·leg_id 동시 지정, Then `validation/parent-exclusive` 거부 | integration | 이미지 픽스처 |
| FR-008 | Given KTX 09:00→11:30·가격 59,800원 입력, When 저장, Then Day 타임라인에 Stop과 통합 position 순 병합 표시(시각은 라벨)·Day 지출 합계 59,800원 표시 / Given 음수 가격, Then `validation/cost-negative` | integration | — |
| FR-008 엣지 | Given 23:00→01:10 입력, When 저장 시도, Then 익일(+1d) 확인 요구·offset=1 저장 / Given offset 미확정 역전, Then `validation/time-reversed` | unit(병합 로직)+contract | — |
| FR-008 병합 | Given [무시각 Stop, 09:00 Leg, 무시각 Stop]의 통합 position 시퀀스, When 타임라인 렌더, Then position 순서 그대로 표시(결정적)·position↔시각 역전 항목에 경고 배지 | unit | 픽스처 3종 |
| FR-009 | Given Place 카드, When 메모 저장·네이버 링크 클릭, Then PATCH 반영·새 탭 열림 | integration | — |
| SC-001 | Given 캔버스, When "검색→선택→카테고리 확정" 플로우 실행, Then 사용자 결정 지점 = 3 (E2E 스텝 카운트 어서션) | E2E | — |
| SC-003 | Given 전 화면 라우트 목록, When 플로우 다이어그램 검수, Then 뎁스 ≤2·화면당 주 CTA 1개 | 수동 검수(체크리스트) | 06 부록 체크리스트 |
| SC-004 | Given Stop 8+Leg 3 시드, When 390×844 렌더, Then 전 Leg 시각 1스크롤 내 (Playwright viewport 스크린샷) | E2E | 시드 Day |
| SC-005 / FR-010 | Given 공유 켬, When 시크릿 창 조회, Then 성립 / When 쓰기 API 직접 호출, Then 403 / When 공유 끔, Then 기존 토큰 403 | E2E + contract | 토큰 픽스처 |
| SC-006 / FR-011 | Given 여행 기간 중 날짜 고정(clock mock), When PWA 실행, Then 조작 0회로 오늘 타임라인·4G 스로틀 ≤2s | E2E | Playwright clock |
| SC-007 / FR-012 | Given Trip 1회 조회 후 오프라인 전환, When 재실행, Then 리스트·타임라인 표시+오프라인 배너 | E2E(offline 모드) | SW 활성 빌드 |
| SC-008 | Given 검색 25회 호출, When api_usage 집계, Then 카운터=25 / Given 카운터를 12,500으로 시드, When 검색, Then 429 `search/quota-exceeded` | integration | 카운터 시드·리셋 |
| SC-009 | Given 동행자 2인·공유 링크, When "둘째 날 저녁 식당·다음 날 첫 이동 시각" 과제, Then 2/2 완료 (구두 안내 금지) | 수동 사용성 | 실인원 |

**누락 확인: SC-001~009 전부·P0/P1 FR(FR-001~009·FR-014~018) 전부 ≥1 시나리오 — 누락 0** (P2 FR-010~012는 SC-005·006·007로 커버, FR-013은 2단계 진입 시 작성)

## 계약 테스트 (05 기준)

- E-03: 응답 스키마(maxItems 5·필수 필드·WGS84 범위)·429/502 Problem JSON 형식·`cached[]` 동봉 검증
- E-04: 중복(동일 trip+이름+좌표) → `conflict/duplicate` · 좌표 범위 밖 → `validation/coords`
- E-11: 유효 토큰 → owner 식별정보 부재 확인 / 무효·해제 토큰 → 403 단일 응답(구분 없음)
- 멱등성: 동일 UUID로 E-04 2회 → 1행 · E-07 동일 배열 2회 PUT → 동일 결과
- RPC 트랜잭션: E-02·E-14·`reorder_day_items` 중간 실패 주입 시 전체 롤백(부분 상태 없음) · E-11 실패 시 `api_usage` 카운터 증가 확인 · 운영 RPC 3종의 EXECUTE가 anon 롤에서 거부되는지 확인
- **RLS 정책 (위협모델 연동)**: 계정 B가 계정 A의 trips/places/stops/legs/photos에 SELECT/INSERT/UPDATE/DELETE 각각 → 전부 거부. 무인증 접근 → 거부. share-viewer 토큰으로 쓰기 함수 부재 확인

## E2E 후보 (핵심 여정만)

1. **첫 여행 만들기**: 가입(매직링크)→Trip 생성→장소 3종 검색 저장→사진 첨부→Day 배치→Leg 입력→타임라인 확인 (US-1~3 통합, 스모크 겸용)
2. **공유 여정**: 공유 켬→시크릿 조회→쓰기 403→해제→403 (SC-005 — 보안 게이트)
3. **여행 당일**: 오늘 뷰 자동 표시→오프라인 재실행 (SC-006·007)

## 리스크 기반 커버리지 목표

| 영역 | 목표 | 근거 |
|---|---|---|
| RLS 정책·공유 토큰 경로 | 정책·연산 조합 100% (매트릭스 전수) | 위협모델 상위 리스크 1·2 |
| 좌표 변환·시간 병합(offset) | 분기 100% + 경계값 픽스처 | 틀리면 조용히 오염(지도 오표시·타임라인 역전) |
| 프록시(캐시·쿼터·폴백) | 상태 3종(정상·캐시·차단) 전수 | SC-008 무료 티어 방어 |
| UI 컴포넌트 일반 | 핵심 인터랙션 위주(스냅샷 남발 금지), 커버리지 수치 목표 없음 | 개인 도구 — 피라미드 하위 우선 |

## 부록 — SC-003 뎁스·CTA 검수 체크리스트 (GATE M-3 실물화)

라우트 전수: `/`(여행 목록, 뎁스 0) · `/trip/[id]`(캔버스, 뎁스 1) · 캔버스 내 카드/바텀시트/타임라인(뎁스 2 — 라우트 아님) · `/s/[token]`(공유 뷰, 독립 뎁스 0) · `/login`(인증 — 뎁스 산정 제외)

- [ ] 신규 라우트 추가 시 위 목록에 등재하고 뎁스 재계산 (≤2 유지)
- [ ] 각 화면 주 CTA 1개 확인: 목록="새 여행" · 캔버스="장소 담기" · 카드="일정에 넣기" · 공유 뷰=CTA 없음(읽기전용)
- [ ] 진입 즉시 모달 0건 (T-04)
- [ ] 모든 에러 화면에 다음 행동 버튼 존재 — 막다른 에러 0 (L-06)
- [ ] 강조색 CTA 화면당 1개 (L-09)

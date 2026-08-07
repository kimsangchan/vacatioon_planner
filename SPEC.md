# SPEC — Trip Canvas MVP

작성 2026-08-06 · 진실원(source of truth). 설계 근거·결정 이력은 `docs/design/`(service-autopilot 산출물, GATE 2회 통과)이며, 이 문서와 충돌하면 **이 문서가 우선**한다.

## 배경 (Context)

개인용 여행 기록 웹앱. 장소(식당·숙박·스팟)를 3클릭 내 저장해 지도+리스트 캔버스로 보고, 일차별로 배치하며, 이동(교통) 예매 정보(시각·가격·캡처)를 타임라인으로 한눈에 본다. 상세 요구·근거: `docs/design/03-prd.md`.

## 현재 상태 (Current State)

그린필드. `create-next-app`(Next.js 16.3, React 19, TypeScript, Tailwind, App Router, `src/` 구조, ESLint, Turbopack) 스캐폴드 직후 상태. 애플리케이션 코드 0줄.

| 파일 | 상태 |
|---|---|
| `docs/design/00~08, decision-log` | 설계 패키지 (읽기 전용 — 수정은 기획 변경 시에만) |
| `src/app/page.tsx` 등 스캐폴드 기본 파일 | 전부 교체 대상 |

## 제안 변경 (Proposed Change)

MVP = PRD의 **P0 + P1 요구사항 전부**: FR-001~009, FR-014~018 (`docs/design/03-prd.md` 요구사항 풀). P2(공유 FR-010, 오늘 뷰 FR-011, 오프라인 FR-012, 구글 병행 FR-013)는 이번 범위 밖 — 단 스키마·인터페이스는 P2를 수용하도록 이미 설계됨(share_token 컬럼, provider enum, MapProvider 추상화).

### 구현 세부 (Implementation Details)

#### 스택·환경변수

- Next.js 16 App Router + TypeScript strict + Tailwind. 배포 Vercel, DB/인증/스토리지 Supabase (로컬 개발: `npx supabase start`, Docker 필요 — 설치 확인됨)
- 환경변수 (`.env.local`, 코드에 리터럴 금지):
  `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NAVER_SEARCH_CLIENT_ID` · `NAVER_SEARCH_CLIENT_SECRET`(NCP NAVER API HUB 발급 X-NCP-APIGW 키쌍 — 서버 전용, `NEXT_PUBLIC_` 접두사 금지. 개발자센터 검색 API는 신규 등록 불가 — decision-log #19) · `NEXT_PUBLIC_NCP_MAP_CLIENT_ID`
- 의존성 추가: `@supabase/supabase-js` `@supabase/ssr` `proj4` `@tanstack/react-query`(서버 상태) · dev: `vitest` `@testing-library/react` `playwright` `supabase`(CLI는 npx)

#### 디렉터리 구조 (파일명까지 확정)

```
src/
├─ app/
│  ├─ page.tsx                     # 여행 목록 (FR-014) — 뎁스 0
│  ├─ login/page.tsx               # OTP 인증 (FR-001)
│  ├─ trip/[id]/page.tsx           # 캔버스 (FR-003~009, 015~018) — 뎁스 1
│  └─ api/place-search/route.ts    # E-03 프록시
├─ components/
│  ├─ canvas/MapPane.tsx           # MapProvider 소비, 핀·클러스터·상호 하이라이트
│  ├─ canvas/ListPane.tsx          # 보관함·일차 탭 리스트
│  ├─ canvas/TimelinePane.tsx      # Day의 Stop+Leg 통합 position 병합 뷰 + 지출 합계
│  ├─ canvas/PreviewCard.tsx       # 데스크톱 호버 카드 / 모바일 바텀시트
│  ├─ canvas/PlaceSearchBox.tsx    # 검색 입력(디바운스 300ms)·결과 10건·카테고리 확정
│  └─ canvas/LegForm.tsx           # 이동 입력 폼 (시각·가격·예약번호·캡처 첨부)
├─ lib/
│  ├─ map/provider.ts              # MapProvider 인터페이스 (아래 시그니처)
│  ├─ map/naver.ts                 # NaverMapProvider (NCP Web Dynamic Map JS SDK)
│  ├─ geo/naver-coords.ts          # mapx/mapy → WGS84 (아래 알고리즘)
│  ├─ timeline/merge.ts            # mergeDayItems + daySum (아래 알고리즘)
│  ├─ place/category.ts            # 네이버 category 문자열 → 카테고리 힌트
│  ├─ photo/resize.ts              # 클라 리사이즈 1600px WebP + 썸네일 320px
│  └─ supabase/{client,server}.ts  # 브라우저/서버 클라이언트 (@supabase/ssr 표준 패턴)
supabase/migrations/
├─ 0001_schema.sql                 # 도메인 6테이블 + 운영 2테이블 (ERD: docs/design/05 §ERD)
├─ 0002_rls.sql                    # RLS 정책 전수 (docs/design/05 §권한 모델 표 그대로)
└─ 0003_rpc.sql                    # RPC 9종 (아래 목록)
supabase/tests/*.sql               # pgTAP — RLS 매트릭스·RPC 트랜잭션
e2e/*.spec.ts                      # Playwright 3여정 (docs/design/06 §E2E)
```

#### 데이터 계층 (05 계약이 정본 — 여기선 구현 지시만)

- 스키마: `docs/design/05-api-contract.md`의 ERD를 그대로 DDL로. 필수 제약: places 부분 유니크 `(trip_id,name,lat,lng) WHERE deleted_at IS NULL` · photos `CHECK (num_nonnulls(place_id, leg_id) = 1)` · legs `CHECK (cost_amount IS NULL OR cost_amount >= 0)` · category/provider/mode는 CHECK 제약(enum 타입 대신 — 값 추가가 마이그레이션 없이 불가한 PG enum 회피)
- RPC 9종 (시그니처 고정): `create_trip(id,name,start_date,end_date,timezone)` · `update_trip_dates(trip_id,start_date,end_date) → {removed_stops int, unassigned_places int}` · `reorder_day_items(day_id, ordered_ids uuid[])` · `enable_share(trip_id) → token` / `disable_share(trip_id)` · `get_shared_trip(token)`(P2에 노출하지만 함수는 지금 작성 — 스키마와 함께 테스트) · `record_search_usage(kind text) → int`(증가 후 현재값 반환) · `store_search_cache(qhash,response)` · `get_cached_search(qhash) → jsonb|null`(5분 초과분 null)
- EXECUTE 권한: `get_shared_trip`만 anon 허용, 나머지 전부 authenticated 한정. service role 키는 어떤 런타임 코드에도 등장 금지 (`docs/design/04` 결정 #11)

#### 핵심 알고리즘 (구현자 재량 없음)

**1. 네이버 좌표 변환 — `geo/naver-coords.ts`**
지역 검색 API의 `mapx/mapy`는 세대에 따라 3형식 — KATECH(TM128) · WGS84×10⁷ 정수 · WGS84 도 단위(NCP API HUB 문서 기준, 2026-08-06 확인). 값 크기로 판별한다:
```
toWgs84(mapx, mapy):
  if |mapx| ≤ 180 and |mapy| ≤ 90  →  그대로 {lng, lat}       # WGS84 도 단위
  elif |mapx| ≥ 1e8                →  { lng: mapx/1e7, lat: mapy/1e7 }  # WGS84×10⁷
  else                             →  proj4(TM128, WGS84, [mapx, mapy]) # KATECH
TM128 proj4 정의(고정): "+proj=tmerc +lat_0=38 +lon_0=128 +k=0.9999 +x_0=400000
  +y_0=600000 +ellps=bessel +units=m +no_defs
  +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43"
결과 검증: lat ∈ [33,39], lng ∈ [124,132] 밖이면 오류(사용자 지도 확인 플로우 — PRD 엣지)
```
구현 0단계(T0)에서 실제 응답으로 형식을 실측 확인하고, 사용하지 않는 분기도 테스트 픽스처로 유지한다(API 재변경 대비).

**2. 타임라인 병합 — `timeline/merge.ts`** (결정 #15)
```
mergeDayItems(stops[], legs[]) → DayItem[]:
  전 항목을 position 오름차순 단일 배열로 정렬 (시각은 정렬 키 아님)
  timeWarning = true 조건: 시각이 있는 항목들 사이에서, position 순서와 시각 순서가 역전될 때
    (Leg는 depart_at 기준, arrive_day_offset ≥ 1인 Leg의 arrive는 비교 대상 제외)
dayTotal(stops[], legs[]) → int: 양쪽 cost_amount 비-null 합 (원 단위 정수 그대로 — 부동소수점 연산 금지. 결정 #24: Stop 지출 = 방문 귀속)
```

**3. 카테고리 힌트 — `place/category.ts`**
네이버 `category` 문자열 최상위 토큰 기준. **실측(T0-4·T5 스모크) 정정**: API HUB는 최상위 토큰이 요리명("한식>칼국수,만두")으로 온다 — 요리 분류 어휘 포함: `음식점|한식|일식|중식|양식|아시아음식|분식|뷔페|패스트푸드|치킨|피자|술집|카페|디저트|간식` → restaurant · `숙박|호텔|모텔|펜션|게스트하우스|리조트` → lodging · 그 외 → spot (decision-log #23). 힌트일 뿐 — 최종 확정은 항상 사용자 (SC-001의 결정 3).

**4. 검색 프록시 — `app/api/place-search/route.ts`** (E-03)
```
인증 확인(미인증 401) → q 정규화·2자 미만 400 → get_cached_search 히트 시 즉시 반환
→ record_search_usage('naver_search')가 12,500 초과면 429 Problem JSON
→ 지역검색 호출: NCP NAVER API HUB `GET /search/v1/local`, display=5(API 최대값),
  헤더 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`, base URL `https://naverapihub.apigw.ntruss.com` (T0-4 실측)
→ title의 <b></b> 등 HTML 태그 제거 → toWgs84 변환
→ categoryHint 부여 → store_search_cache → NormalizedPlace[] 반환
→ 업스트림 5xx: 502 + 직전 캐시 있으면 cached[] 동봉
에러는 전부 RFC 9457 Problem JSON (type/title/status/detail/instance)
```

**5. MapProvider 인터페이스 — `lib/map/provider.ts`**
```ts
interface MapProvider {
  mount(el: HTMLElement, center: LatLng, zoom: number): Promise<void>;
  setPins(pins: Pin[]): void;           // Pin = {id, latLng, category, selected}
  panTo(latLng: LatLng): void;
  onPinEvent(cb: (id: string, ev: 'hover'|'tap'|'leave') => void): void;
  onLongPress(cb: (latLng: LatLng) => void): void;   // FR-016 (데스크톱: 우클릭)
  destroy(): void;
}
```
UI는 이 인터페이스만 소비. `naver.ts`가 MVP 구현체(카카오·구글은 후속 — 같은 파일 패턴).

#### 인증 (FR-001, 결정 #13)

`signInWithOtp({email})` → 로그인 화면에 **6자리 코드 입력란을 기본**으로 표시(+ "메일 링크로도 열려요" 보조) → `verifyOtp({email, token, type:'email'})`. 전제(T0에서 설정): Supabase 대시보드 메일 템플릿에 `{{ .Token }}` 포함. 매직링크만으로는 iOS 설치형 PWA에서 로그인 불가(세션 격리) — 코드 입력이 기본인 이유.

#### UI 규칙 (전 컴포넌트 공통 — docs/design/03 §UI 방향)

문구 해요체·능동형·긍정형, CTA는 행동 서술("보관함에 담기") · 진입 모달 금지 · 화면당 강조 CTA 1개 · 에러엔 항상 다음 행동 버튼 · 카테고리 3색(식당/숙박/스팟) 핀·배지 일관 · 호버 카드 fade 120ms, 모바일 바텀시트 슬라이드 외 장식 모션 금지 · 터치 타깃 ≥32px

## 수용 기준 (Acceptance Criteria — 전부 pass/fail)

1. `docs/design/06-test-design.md` 변환표의 **FR-001~009·014~018 시나리오 전부 통과** (vitest + pgTAP + Playwright)
2. SC-001: 검색→저장 사용자 결정 3지점 이하 — E2E 스텝 카운트 어서션
3. SC-002: 호버→카드 표시 ≤400ms — Playwright trace 계측
4. SC-003: 라우트 뎁스 ≤2 — `docs/design/06` 부록 체크리스트 전 항목 체크
5. SC-004: 390×844에서 Stop 8+Leg 3 시드의 전 Leg 시각 1스크롤 내 — 스크린샷 검수
6. SC-008: 쿼터 카운터 정확 + 12,500 도달 시 429 — integration 테스트
7. `npm run build` 종료코드 0 · `npm run lint` 0 에러 · pgTAP 전체 green
8. RLS 매트릭스(타 계정 × 6테이블 × 4연산 + anon) 전부 거부 — pgTAP

## 테스트 계획 (Testing Plan)

| 레이어 | 도구 | 대상 | 건수(최소) |
|---|---|---|---|
| unit | vitest | naver-coords(픽스처 5+형식 판별)·merge(병합·경고·합계)·category·Problem 직렬화 | 20 |
| integration | vitest + supabase 로컬 | 프록시 상태 3종·CRUD·E-14 캐스케이드·사진 배타 | 12 |
| DB | pgTAP | RLS 매트릭스 전수·RPC 트랜잭션 롤백·EXECUTE 권한 | 15 |
| E2E | Playwright | 여정 1(가입→저장→배치→타임라인)·SC-001/002/004 계측 | 4 |

## 검증 방법 (Verification)

```
npm test                      # vitest 전체
npx supabase start && npx supabase db reset   # 마이그레이션+시드 적용
npx supabase test db          # pgTAP
npm run build && npm run lint
npx playwright test           # 로컬 dev 서버 대상
```
전부 종료코드 0 = 완료. "된 것 같다" 금지 — 실행 로그를 증거로 남긴다.

## 롤백 계획 (Rollback)

- 코드: 작업 단위 커밋 → `git revert` / 배포는 `vercel rollback`(즉시)
- DB: 마이그레이션은 forward-only. 파괴적 변경 전 `pg_dump` 필수(일일 백업 별도 — docs/design/07). 로컬은 `npx supabase db reset`으로 재현

## 범위 밖 (Out of Scope)

FR-010~013(공유 노출·오늘 뷰·오프라인 SW·구글 병행 — 스키마는 준비됨) · PWA manifest/SW(P2와 함께) · 정산 계산·분배 · 공동 편집 · 예매처 연동 · CI/CD·백업 워크플로 구성(tasks T11, 코드 완성 후)

## 참조 파일 (Files Reference)

| 파일 | 역할 |
|---|---|
| `docs/design/03-prd.md` | FR·SC·엣지케이스 정본 |
| `docs/design/05-api-contract.md` | ERD·RLS·RPC·에러 계약 정본 |
| `docs/design/06-test-design.md` | 시나리오 변환표·pgTAP 매트릭스·SC-003 체크리스트 |
| `docs/design/04-architecture.md` §위협모델 | 보안 제약(비밀·RLS·토큰) 근거 |
| `docs/design/07-ops-design.md` | 배포·알림·백업 (T11에서 사용) |
| `tasks.md` | 실행 순서 |

---
**SELF-SCORE: 8/10** — 감점 요인: ① 네이버 mapx/mapy 실제 형식이 T0 실측 전 이중 분기로 남음(설계상 의도), ② NCP 지도 SDK 로딩 세부(스크립트 URL·클러스터 옵션)는 공식 문서 참조 필요. 둘 다 구현 중 결정이 아니라 확인 사항이며 폴백이 명시돼 있음 — 게이트(≥7) 통과.

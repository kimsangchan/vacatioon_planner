# tasks — Trip Canvas MVP

규칙: 한 작업 = 반나절 이내·개별 검증 가능. [P] = 선행만 충족하면 병렬 가능. 기능 작업은 **실패하는 테스트 먼저**. 완료 기준이 pass/fail이 아니면 그 작업은 잘못 쪼개진 것.

## T0. 계정·키 발급 — 사용자(사람) 작업 ⚠️ T7·T5 실키 테스트의 블로커

- [x] T0-1 **[정정 2026-08-06]** NCP 콘솔(ncloud.com) 가입 → **NAVER API HUB** 이용 신청 → 검색 API 키쌍(X-NCP-APIGW-API-KEY-ID/-KEY) 발급. **신청 화면의 요금·무료 제공량 확인 필수**(콘솔 확인: 일 25,000회 무료 제공). 개발자센터(developers.naver.com)에는 검색 API 신규 등록이 없음 — decision-log #19/#20 (2026-08-06)
- [ ] T0-2 같은 NCP 콘솔에서 Maps(Web Dynamic Map) 등록 → **신규 계정 무료 이용량 적용 여부 확인** (미적용이면 즉시 보고 — 카카오 폴백 결정, docs/design/08 잔여 우려 1)
- [ ] T0-3 Supabase 프로젝트 생성 + Auth 메일 템플릿 교체 — **형식은 `supabase/templates/magic_link.html`과 동일하게**: 본문에 `{{ .Token }}`(6자리 코드) + 링크는 `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (T4에서 로컬 실증 — 기본 템플릿엔 코드가 없어 FR-001 불성립)
- [x] T0-4 검색 API(`GET /search/v1/local`) 실호출 1회로 base URL·`mapx/mapy` 형식(3형식 중 무엇인지) 실측 → 결과를 `docs/design/decision-log.md`에 기록 (변환기는 3형식 모두 지원 — GREEN 상태) (2026-08-06)
- 완료 기준: `.env.local`에 5개 환경변수 채워짐 + T0-4 기록 존재
- 참고: T1~T4·T6은 T0 없이 진행 가능 (로컬 Supabase + 목킹)

## T1. 기반 정비 (스캐폴드는 완료됨)

- [x] T1-1 create-next-app 스캐폴드 (2026-08-06 완료)
- [x] T1-2 의존성 설치 (2026-08-06 완료)
- [x] T1-3 vitest 설정 + `npm test`·`lint`·`build` 전부 종료코드 0 (2026-08-06 완료)
- [ ] T1-4 초기 커밋 (스캐폴드+SPEC+tasks+CLAUDE.md+docs) — 사용자 확인 후
- 완료 기준: `npm test`·`npm run build`·`npm run lint` 전부 종료코드 0

## T2. 순수 도메인 로직 [P — T1 후 서로 병렬]

- [x] T2-1 `geo/naver-coords.ts` — RED→GREEN 5테스트 (형식 판별·라운드트립 3도시·범위 검증) (2026-08-06)
- [x] T2-2 `timeline/merge.ts` — RED→GREEN 8테스트 (2026-08-06)
- [x] T2-3 `place/category.ts` — RED→GREEN 3테스트 (2026-08-06)
- [x] T2-4 `photo/resize.ts` — 실패 테스트 먼저(1600px 축소·작은 이미지 무확대·WebP 출력·2MB 상한) → 구현 (canvas DI로 노드 테스트) (2026-08-06) + 검토 반영: 썸네일 320px `prepareTripPhoto` RED→GREEN (2026-08-07)
- 완료 기준: 각 모듈 테스트 green + 커버리지 분기 100%(geo·merge — docs/design/06 리스크 목표)

## T3. DB 마이그레이션 + pgTAP (T1 후, T0 불필요 — 로컬 Supabase)

- [x] T3-1 `0001_schema.sql` — 8테이블 + CHECK 제약 + 부분 유니크 (SPEC §데이터 계층). 완료: `npx supabase db reset` 성공 (2026-08-06) + 검토 반영: stops (day_id,place_id) 유니크 제거 — 같은 장소 하루 2회 배치 허용 (2026-08-07, 결정 #21)
- [x] T3-2 pgTAP RLS — `0002_rls.sql` green (2026-08-06) + 검토 반영: 잔여 GRANT 4건 제거·매트릭스 22어서션 확장(교차 INSERT 5테이블·UPDATE/DELETE 0행·운영 테이블 및 anon 6테이블 permission denied) PASS (2026-08-07)
- [x] T3-3 pgTAP 실패 테스트 먼저: RPC 9종 시그니처·트랜잭션 롤백·EXECUTE 권한(운영 3종 anon 거부, get_shared_trip anon 허용) → `0003_rpc.sql` 작성해 green. `supabase/tests/rpc.sql` 82어서션 RED→GREEN + updated_at 트리거 6테이블 (2026-08-07)
- 완료 기준: `npx supabase test db` 전체 green (15+ 어서션) — 달성: rls 22 + rpc 82 = 104 PASS

## T4. 인증 + 여행 목록·생성 (T3 후)

- [x] T4-1 `lib/supabase/{client,server,env,session}.ts` + `src/proxy.ts` (Next 16: middleware→proxy 개명 실측) (2026-08-07, Opus)
- [x] T4-2 `/login` OTP 코드 기본 UI + `/auth/confirm` 링크 경로 + 로컬 메일 템플릿(`{{ .Token }}`) — Mailpit API로 코드 취득 integration green (2026-08-07, Opus)
- [x] T4-3 `/` 여행 목록(E-13)·새 여행 폼(create_trip)·`/trip/[id]` 자리표시·error.tsx (2026-08-07, Opus)
- 완료 기준 충족: 06 변환표 FR-001·002·014 시나리오 green (vitest 47) — 브라우저 E2E는 T8 이연

## T5. 검색 프록시 (T2-1·T3 후) [P with T4]

- [x] T5-1 실패 테스트 먼저: unit 16 + integration 5 (401·400·429·502+cached·캐시 히트 시 업스트림 미호출·Problem 형식) (2026-08-07, Opus)
- [x] T5-2 `lib/place/search-proxy.ts`(본체) + `app/api/place-search/route.ts`(배선) + `lib/http/problem.ts` (2026-08-07, Opus)
- [x] 실키 스모크 1회: 200·5건·좌표 정상(WGS84e7 분기)·태그 제거 확인 (2026-08-07)
- [x] 카테고리 힌트 실측 정정: API HUB category는 요리명이 최상위 토큰("한식>...") — 어휘 확대 RED→GREEN (2026-08-07, 결정 #23)
- [ ] T5-3 업스트림 장애 시 stale 캐시 제공 — `get_stale_search(qhash)` RPC 추가(마이그레이션+pgTAP) 후 502 경로 연결 (설계 공백 — 결정 #23. 현재는 5분 내 캐시만 동봉 가능)
- 완료 기준: 목킹 기반 integration 전부 green — 달성 (vitest 68+)

## T6. 캔버스 — 저장·지도·미리보기 (T4·T5 후, 지도 렌더만 T0-2 필요)

- [x] T6-1 MapProvider·NaverMapProvider·FakeMapProvider — SDK 파라미터 실측: `ncpClientId`→`ncpKeyId` 개명(회귀 어서션 포함). 키 미설정 시 Fake 자동 폴백+안내 배너 (2026-08-07, Opus)
- [x] T6-2 `PlaceSearchBox` — 결정 3지점 유지 위해 카테고리 버튼("식당으로 담기")이 곧 저장. 0건/중복/429 분기 (2026-08-07, Opus)
- [x] T6-3 캔버스 조립 — Trip Bundle(react-query)·보관함/일정 섹션·3색 핀·리스트↔핀 상호 하이라이트·모바일 하단 시트 (2026-08-07, Opus. vitest 112) — 클러스터링은 별도 라이브러리 필요로 보류(핀 겹침 엣지)
- [x] T6-4 `PreviewCard`(호버 카드·플레이스홀더+"사진 담기")·사진 업로드(`photo/upload.ts`·prefetch)·`0004_storage.sql`(photos 버킷·정책·pgTAP 19) (2026-08-07, Opus — 세션 한도로 중단된 것을 이어서 검증 완료)
- [x] T6-5 `ManualPlaceForm`(롱프레스/우클릭 수동 등록)·메모 편집·상세 링크 (2026-08-07, Opus)
- [x] 검토 반영: **지도 인증 실패 시 앱 크래시 수정** — SDK는 mount 후 비동기 인증 실패 시 네임스페이스를 비움 → `navermap_authFailure` 훅 구독+SDK 호출 방어+안내 배너 (실브라우저 재현→수정→회귀 테스트 3건, 결정 #24 후보)
- [x] 실브라우저 검증(2026-08-07): 로그인→여행 생성→검색→저장→**실지도 핀·호버 카드** 전 플로우 육안 확인. ⚠️ dev 서버는 반드시 **포트 3000**(NCP 등록 URL과 일치해야 지도 인증 통과)
- 완료 기준: 06 변환표 FR-003~006·009·016 시나리오 green (지도는 FakeMapProvider로, 실지도는 T0 후 육안 확인)

## T7. 일정 배치 + 타임라인 (T6 후)

- [x] T7-1 배치("일정에 넣기" 2탭)·해제·일차 탭·순서 변경(reorder_day_items — Stop 단독 이동도 혼합 배열)·Stop 시각/가격 입력 (2026-08-07, Opus)
- [x] T7-2 `LegForm`(offset 확인 게이트·가격)·`TimelinePane`(통합 position 병합·경고 배지·**Day 지출 합계 = Stop+Leg** 결정 #24)·`0005_stop_cost.sql`+pgTAP 13 (2026-08-07, Opus. vitest 234·pgTAP 136·실브라우저 확인)
- [x] 검토 반영: storage.sql #14의 절대 건수 어서션 → 시드 경로 한정으로 수정 (실사용 업로드 누적 시 오탐 — 2026-08-07)
- [ ] T7-4(백로그, P2 공유 착수 시): `get_shared_trip` stops 투영에 `cost_amount` 추가 — 새 마이그레이션으로 함수 재정의 (0003 불변 원칙. 미반영 시 공유 뷰 Day 합계가 Stop 지출만큼 누락)
- [ ] T7-3 실패 테스트 먼저 → Leg 사진 첨부(FR-018, parent-exclusive) · 기간 변경 캐스케이드(FR-015, E-14) · 삭제·되돌리기(FR-017)
- 완료 기준: 06 변환표 FR-007·008·015·017·018 시나리오 green

## T8. E2E + SC 계측 (T7 후)

- [ ] T8-1 여정 1: 가입→Trip→장소 3종 저장→사진→배치→Leg→타임라인 (스모크 겸용)
- [ ] T8-2 SC-001 스텝 카운트 · SC-002 400ms trace · SC-004 390×844 스크린샷 어서션
- [ ] T8-3 SC-003 뎁스·CTA 체크리스트 수동 검수 (docs/design/06 부록 — 결과를 이 파일에 체크)
- 완료 기준: `npx playwright test` green + 체크리스트 전 항목 ✓

## T9. 배포·운영 (T8 후, T0 필수)

- [ ] T9-1 Vercel 프로젝트 연결 + env 등록 + Preview 배포 → 실기기(아이폰) 육안 확인
- [ ] T9-2 GitHub Actions: CI(lint→test→build→pgTAP→E2E) + 일일 점검·pg_dump 백업·90일 파기 워크플로 (docs/design/07)
- [ ] T9-3 SHIP: 증분 커밋 정리 + Production 승격 + smoke
- 완료 기준: Production URL에서 여정 1 수동 통과 + 백업 아티팩트 1개 생성 확인

## 의존성 요약

```
T0(사용자) ──────────────┐
T1 → T2[P] ─┬→ T5 ─┐     ├→ T6(실지도)·T9
     T3 ────┴→ T4 ──┴→ T6 → T7 → T8 → T9
```

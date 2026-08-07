# Readiness Report — Trip Canvas (여행 플래너)

판정일 2026-08-06 · 검토 방식: fresh context 적대적 검토 2회 (스킬 상한)

## 판정: **CONCERNS — 구현 착수 가능** (우려 사항 명시 하에)

- 1차 검토: FAIL (CRITICAL 2·HIGH 9·MEDIUM 6) → 전 항목 타당성 필터링 후 해당 절 단위 수정
- 2차 검토: CONCERNS — 1차 지적 16건 중 15건 RESOLVED, 1건 PARTIAL(문구 잔재) + 신규 경미 8건(N-1~N-8)
- 2차 후속 조치: N-1(용어 잔재 3곳)·N-2(재정렬 원자성 → `reorder_day_items` RPC)·N-3~N-7(RPC 명세·EXECUTE 권한·soft delete 필터·90일 파기 주체)·N-8(E-14 반환 정의) **전부 문서 반영 완료**

### 잔여 우려 (구현 중 확인 항목 — 문서로는 닫을 수 없는 것)

1. **네이버 API 실측 확인 (구현 0단계 필수)**: NCP Maps 무료 이용량(웹 다이나믹맵 월 1,000만)의 신규 계정 적용 여부 + 지역 검색 25,000회/일의 공식 문서 확인. 미충족 시 카카오 폴백(MapProvider 구현체 1개 교체 — 설계 내장, 결정 #2·#16)
2. Supabase Auth 메일 템플릿에 `{{ .Token }}`(6자리 코드) 노출 설정 — 대시보드 설정 항목이라 코드 밖 (FR-001 전제)
3. 사용성 SC-009(동행자 2인 태스크 테스트)는 구현 후에만 측정 가능

## 핵심 결정 요약

1. 플랫폼 = **반응형 웹 + PWA** (Next.js·Vercel·Supabase, 전 구간 무료 티어) — 결정 #1·#9
2. 지도 = **국내 네이버(MVP) → 해외 구글(2단계)**, MapProvider/PlaceSearchProvider 추상화 + WGS84 정규화로 교체 비용 최소화 — 결정 #2·#6
3. 사용 모델 = **1계정(매직링크+OTP) + 여행별 읽기전용 공유 토큰**, 권한은 전부 DB 계층(RLS+SECURITY DEFINER RPC)에서 강제 — 결정 #3·#11·#13
4. 핵심 UX = 지도+리스트 단일 캔버스·뎁스 ≤2·저장 3클릭·호버 400ms — 전부 측정 가능한 SC-001~009로 고정
5. 백업 = GitHub Actions 일일 pg_dump(RPO 24h) — Supabase 무료 플랜 자동 백업 부재를 공식 소스로 확정 후 설계 — 결정 #14

## 질문에서 가정으로 채택된 항목 (사용자 확인 없이 진행한 것)

02-register의 Assumed 전체 중 영향 큰 것: 사진 = 사용자 업로드(국내 API 사진 미제공이 확정 사실) · 이동 = 수동 입력(예매처 공개 API 부재) · 보관함(수집/배치 분리) 모델 · 공동 편집 non-goal · 오프라인 = 읽기 캐시만 · 경비 정산 non-goal. 이 중 바꾸고 싶은 것이 있으면 03-prd 해당 FR만 수정하면 된다(전면 재설계 불요).

## 사용자 피드백 반영 (2026-08-06, GATE 후)

- 이동(Leg)에 **가격 필드**(원 단위 정수) + Day 지출 합계 표시 추가 — 정산 계산·분배는 여전히 2단계이나 데이터는 지금부터 기록 (FR-008 확장, 결정 #17)
- **Leg에도 사진 첨부**(예매 확인·티켓 캡처) — Place 사진과 동일 파이프라인 (FR-018 신설, 결정 #18). 장소 사진 직접 첨부는 기존 설계(FR-004) 그대로
- 반영 문서: 02(축 2개 재마킹)·03(FR-008·018, non-goal 3 수정)·05(ERD·E-05·E-08·권한·데이터 규칙·커버리지)·06(시나리오 2건) — P0/P1 커버리지·시나리오 누락 0 유지

## 구현 핸드오프 (service-prompt-workflow SPEC 입력)

/service-prompt-workflow 로 다음을 실행:
<inputs>autopilot/travel-planner/03-prd.md (요구사항·SC), 04-architecture.md (설계·위협모델), 05-api-contract.md (계약·ERD·RLS), 06-test-design.md (테스트 계획), 07-ops-design.md (배포·운영 요건)</inputs>
<first_task>SPEC.md 작성 — 위 문서를 진실원으로, 낯선 구현자 실행 가능 수준(≥7/10). 구현 0단계 = 네이버 API 실측 확인(본 리포트 잔여 우려 1) + Supabase 메일 템플릿 설정(우려 2)</first_task>
UI 포함 — BUILD·REVIEW에서 frontend-design-taste 적용: dial = 밀도 중간·모션 절제(호버 fade 120ms·시트 슬라이드만), 카테고리 3색 + 중립 배경, 화면당 강조 1곳 (03-prd UI 방향 절)

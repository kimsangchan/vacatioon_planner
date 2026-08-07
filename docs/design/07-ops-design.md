# 배포·운영 설계 — Trip Canvas

작성 2026-08-06 · 입력: 04(아키텍처·위협모델), 05(계약), 06(테스트). 전제: 1인 개발·무료 티어·개인 사용자 규모

## 배포

- 런타임·형상: Vercel(Next.js 관리형 — Dockerfile 불요) + Supabase 클라우드. IaC 스케치:
  - 레포 내 `supabase/migrations/*.sql` (스키마·RLS 정책 전부 — 콘솔 수동 변경 금지)
  - `supabase/config.toml` + 로컬 개발 `supabase start`
  - Vercel 프로젝트 설정은 `vercel.json` + env는 대시보드(코드 미포함 — 04 위협모델)
- CI/CD (GitHub Actions → Vercel 연동):
  1. lint + typecheck → 2. unit·integration(Supabase 로컬 컨테이너) → 3. build → 4. contract(E-03·RLS 매트릭스) → 5. Vercel Preview 배포 → 6. E2E 스모크(Playwright, Preview URL 대상) → 7. main 머지 시 Production 승격 → 8. smoke(E2E #1 축약)
- 설정·비밀: `NAVER_CLIENT_ID/SECRET`(검색 API)·`NCP_MAP_CLIENT_ID`(지도)·Supabase URL/anon key. service role 키는 CI 테스트 전용 — 런타임 미사용(04 DFD)
- SW 캐시 무효화: 빌드마다 SW 버전 갱신 → 구버전 클라 자동 업데이트(P4 강제 업데이트 축 해소)

## 관측성

- SLI (사용자 대면 서비스 표준): 가용성(E-06 성공률)·지연(캔버스 로드)·정확성(검색 결과 좌표 유효율)
- SLO-lite (100% 금지, 사용자 기대 기준 — 개인 도구 수준으로 최소):
  - 캔버스 로드 성공률 ≥ 99% (월간, Vercel 로그 기준)
  - 검색 응답 p95 ≤ 1.5s (프록시+네이버 왕복)
  - 이 2개만 — SLO는 가능한 한 적게 (SRE 규칙)
- 4 골든 시그널 계측:
  - Latency: Vercel 함수 로그(성공/실패 분리) — `/api/place-search` p50/p95
  - Traffic: 일별 검색 호출·E-06 조회 수 (`api_usage` 테이블)
  - Errors: Problem JSON type별 카운트 (프록시 5xx·RLS 거부는 별도 태그)
  - Saturation: **무료 티어 소진율이 이 서비스의 실질 포화 지표** — 네이버 일 쿼터 사용률·Supabase DB/Storage 용량·Vercel 함수 실행량. 확인 도구 = Supabase Studio 저장 쿼리 3종(일 검색량·용량·토큰 실패 추이)을 주 1회 확인 + GitHub Actions 일일 점검(알림 절)
- 로깅 전략:
  - 무엇을: 요청 이벤트(경로·상태·소요)·프록시 업스트림 결과·쿼터 카운트·인증 실패·공유 토큰 조회 실패(04 위협 대응). **좌표·주소·장소명·이메일은 로그 미기록**(04 프라이버시 — 집계 수치만)
  - 어디에: Vercel 함수 로그(플랫폼) + 도메인 카운터는 `api_usage` 테이블
  - 얼마나: Vercel 무료 보존(짧음 — 실시간 진단용) / `api_usage` 12개월 후 삭제. 개인정보 마스킹 대상 자체를 안 남기는 것이 원칙

## 알림 (전부 조치 가능 — 알람:런북 1:1)

| 조건 | 심각도 | 수신자 | 연결 런북 |
|---|---|---|---|
| 네이버 검색 일 사용량 10,000 도달 (상한 12,500의 80%) | 경고 | GitHub Actions 일일 점검 워크플로 실패 → GitHub 기본 알림 메일 | RB-1 |
| Production smoke 실패 (CI) | 위험 | GitHub Actions 알림 | RB-2 |
| Supabase DB/Storage 80% 도달 | 경고 | 동일 일일 점검 워크플로 | RB-3 |
| 공유 토큰 조회 실패 일 100건↑ (계측: E-11 RPC 내부 `api_usage` 카운터) | 경고 | 동일 일일 점검 워크플로 | RB-4 |

발송 채널 단일화(GATE H-8 해소): GitHub Actions 스케줄 워크플로(일 1회)가 `api_usage`·용량을 SQL로 점검하고 임계 초과 시 워크플로를 **실패**시켜 GitHub 기본 알림 메일을 받는다 — 추가 알림 인프라 0 (02 이메일/알림 축 재마킹과 일치). 같은 워크플로가 월 1회 `deleted_at` 90일 경과 레코드 배치 파기를 수행한다(FR-017·05 데이터 규칙의 실행 주체). 원인 지표(지연·트래픽 추이)는 알람 대신 주간 확인 — 증상 기반으로만 울린다(SRE).

## 장애·복구

| 장애 | 감지 | 영향 | 복구 절차 (요지) | RTO/RPO |
|---|---|---|---|---|
| 네이버 API 장애·쿼터 소진 | 프록시 5xx·429 카운트, 알람 #1 | 신규 검색 불가 (기존 데이터 무영향) | RB-1: 캐시 폴백 자동 → 지속 시 카카오 PlaceSearchProvider 전환(환경변수 스위치) | RTO 1일 / RPO 0 |
| 배포 회귀 | smoke 실패, 알람 #2 | 전 기능 | RB-2: `vercel rollback` 즉시 직전 배포 복귀 → 원인 수정 | RTO 10분 / RPO 0 |
| Supabase 장애 | 캔버스 로드 실패 | 읽기: SW 캐시로 최근 Trip 열람 가능 / 쓰기 불가 | RB-3: 상태 페이지 확인·대기(Transfer — 관리형). 용량 문제면 deleted_at 90일 배치 삭제 실행 | RTO 벤더 / RPO 0 |
| 데이터 실수 삭제 | 사용자 인지 | 해당 레코드 | soft delete 복구(`deleted_at` null) → 90일 내면 손실 없음. 그 외 백업 복원 | RPO 24h |
| 공유 링크 유출 | 알람 #4 또는 사용자 인지 | 일정·위치 노출 | RB-4: 공유 끔(즉시 403 — SC-005) → 필요 시 재발급 | RTO 즉시 |
| 서버 키 유출 | 코드리뷰·이상 트래픽 | 쿼터 도용 | 네이버·NCP 콘솔 키 재발급 → Vercel env 교체 → 재배포 (04 위협 대응) | RTO 1시간 |

- 백업 (GATE C-2 정정): **무엇을** — Postgres 전체. **어떻게·주기** — Supabase 무료 플랜은 자동 백업 미제공([공식 문서](https://supabase.com/docs/guides/platform/backups)·[요금표](https://supabase.com/pricing) 확인 2026-08-06, 일일 백업은 Pro부터) → GitHub Actions 스케줄 워크플로가 **일 1회 `pg_dump`**(connection string은 Actions secret) 실행. **어디에·얼마나** — 프라이빗 저장소 암호화 아티팩트 최근 30일 + 월 1회분 장기 보관 12개월. **RPO 24h**. Storage 사진은 원본이 사용자 기기에 있으므로 목록만 백업(Accept). **복원 리허설** — 반기 1회 로컬 `supabase start`에 dump 복원 후 E2E #1 통과 확인
- 런북 골격(RB-1~4 공통): 메타(연결 알람) → 트리거·영향 → 진단 명령(`vercel logs`·`api_usage` 조회 SQL 복붙 수준) → 해결 → 에스컬레이션(벤더 상태 페이지) → 검증(smoke) → 롤백

**게이트 확인**: 로그(어디에=Vercel+api_usage·얼마나=플랫폼 보존+12개월·어떻게=개인정보 미기록 원칙) / 백업(무엇·주기·보관처·리허설 명시) / 복구(시나리오 6종 절차·RTO/RPO) — 전부 답변됨

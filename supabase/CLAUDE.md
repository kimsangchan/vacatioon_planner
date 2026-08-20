# supabase/ — 스코프 작업 지침

이 폴더의 파일을 다룰 때만 로드된다(온디맨드). 공통 행동규칙은 루트 `CLAUDE.md`,
프로젝트 표준·네비게이션은 `AGENTS.md`, 다음-할일은 `NEXT.md`를 따른다.
아래 `#번호`는 `docs/design/decision-log.md`의 결정 번호.

## 목표

스키마·RLS·RPC·Storage 정책과 그 pgTAP 증명. 앱의 권한 경계가 여기서 끝난다.

## 소유 경로

`migrations/`(0001_schema · 0002_rls · 0003_rpc · 0004_storage · 0005_stop_cost) ·
`tests/`(rls · rpc · storage · stop_cost) · `config.toml` · `templates/` · `snippets/`
읽기 전용 입력: `docs/design/04-architecture.md` · `05-api-contract.md` · `SPEC.md §데이터 계층`

## 핵심 관례

- **적용된 마이그레이션은 수정하지 않는다.** 함수·스키마 변경은 **새 번호 파일**로 재정의
  (0003 불변 원칙 — T7-4 백로그가 이 이유로 존재)
- **service role 키를 런타임 코드·env에 넣지 마라.** 운영 테이블 쓰기는 SECURITY DEFINER RPC 경유 (#11)
- **PG enum 대신 CHECK 제약** — enum은 값 추가 마이그레이션이 고통스럽다
- 금액은 원 단위 정수 컬럼 (#17). 일정 시각은 date/time(벽시계), 메타만 timestamptz
- 같은 장소를 하루 2회 배치할 수 있다 — `stops (day_id, place_id)` 유니크를 되살리지 마라 (#21)
- pgTAP은 **절대 건수 어서션 금지** — 실사용 데이터 누적 시 오탐. 시드 경로로 한정하라(storage #14 교훈)
- `config.toml`의 site_url은 **3010** (dev 포트 고정과 일치)
- 메일 템플릿은 본문에 `{{ .Token }}`(6자리 코드) + 링크
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` —
  기본 템플릿엔 코드가 없어 FR-001이 불성립한다

## 함정

- **`npx supabase db reset` 은 로컬 데이터를 지운다.** 실제 여행 기록을 로컬에 만들지 마라
- **vitest integration 은 서로 경합한다** (2026-08-20 원인 확정). vitest 가 테스트 파일을 병렬로
  돌리는데 통합 테스트들이 로컬 Supabase 하나를 같이 쓴다. 5초 타임아웃으로 **매번 다른 한 건**이
  깨지면 코드 문제가 아니다 — `npx vitest run --no-file-parallelism` 이면 전부 통과한다.
  dev 서버를 켜 두면 경합이 한 겹 더 는다

## 검증

`npx supabase db reset` → `npx supabase test db` 전체 green (현재 136 어서션).
RPC·정책 변경은 **실패하는 pgTAP 먼저**.

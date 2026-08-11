# src/lib/ — 스코프 작업 지침

이 폴더의 파일을 다룰 때만 로드된다(온디맨드). 공통 행동규칙은 루트 `CLAUDE.md`,
프로젝트 표준·네비게이션은 `AGENTS.md`, 다음-할일은 `NEXT.md`를 따른다.
아래 `#번호`는 `docs/design/decision-log.md`의 결정 번호.

## 목표

도메인 순수 로직과 외부 경계(지도 SDK·네이버 검색·Supabase)의 어댑터. UI를 모른다.

## 소유 경로

`geo/` `timeline/` `place/` `photo/` `http/` `map/` `supabase/` `trips/`
읽기 전용 입력: `docs/design/05-api-contract.md`(계약) · `SPEC.md §알고리즘`

## 핵심 관례

- **좌표는 WGS84만 저장.** KATECH·WGS84e7 변환은 `geo/naver-coords.ts` 경계에서만 한다 (#6)
- 네이버 지역검색 `mapx/mapy`는 3형식(KATECH / WGS84×10⁷ / WGS84 도) — **값 크기로 판별**
  (SPEC §알고리즘 1). 실측상 현재 API HUB는 WGS84×10⁷ 반환 (#20). 변환기는 3형식 모두 지원 유지
- **Day 내 순서는 stops∪legs 통합 `position`이 유일 진실.** 시각으로 정렬하지 마라 (#15) —
  `timeline/merge.ts`
- 지도는 `map/provider.ts`의 `MapProvider` 인터페이스로만 노출. 구현체(`naver.ts`/`fake.ts`)를
  다른 모듈이 직접 import하지 않는다 (#2 카카오 폴백 전제)
- 네이버 검색 응답 `title`에 `<b>` 태그 포함 — **프록시(`place/search-proxy.ts`)에서 제거**
- 검색 쿼터 일 12,500 상한 상수를 바꾸면 `docs/design/05`·`07`도 **함께** 갱신
- 금액은 원 단위 정수(`timeline/money.ts`) — 부동소수점 연산 금지 (#17)
- API 에러는 `http/problem.ts`의 RFC 9457 Problem JSON으로 통일

## 검증

`npm test` — `geo`·`timeline/merge`는 분기 커버리지 100% 유지 (docs/design/06 리스크 목표)

@AGENTS.md

# Trip Canvas — 에이전트 지침

개인용 여행 플래너 (Next.js 16 App Router + Supabase). 진실원: `SPEC.md` → `tasks.md` → `docs/design/`(설계 근거·결정 이력). 충돌 시 SPEC.md 우선. Next.js 16 API는 학습 데이터와 다를 수 있음 — AGENTS.md 지시대로 `node_modules/next/dist/docs/` 먼저 확인.

## 명령

- `npm test` — vitest · `npm run build` · `npm run lint`
- `npx supabase start` / `npx supabase db reset`(마이그레이션 적용) / `npx supabase test db`(pgTAP)
- `npx playwright test` — E2E (로컬 dev 서버 필요)

## 반드시 (어기면 설계 붕괴 — 근거: docs/design/decision-log.md의 #번호)

- **좌표는 WGS84만 저장.** KATECH·WGS84e7 변환은 `src/lib/geo/naver-coords.ts` 경계에서만 (#6)
- **일정 시각은 벽시계 값**(time/date, trips.timezone 기준). UTC 변환 저장 금지 — created_at 등 메타만 timestamptz (docs/design/05 §규약)
- **Day 내 순서는 stops∪legs 통합 position이 유일 진실.** 시각으로 정렬하지 마라 (#15)
- **금액은 원 단위 정수.** 부동소수점 연산 금지 (#17)
- **service role 키를 런타임 코드·env에 넣지 마라.** 운영 테이블 쓰기는 SECURITY DEFINER RPC 경유 (#11)
- **네이버 검색 키는 서버 전용** — `NEXT_PUBLIC_` 접두사 금지, 클라이언트 번들 노출 금지
- **테스트 우선.** 기능 코드 전에 실패하는 테스트. tasks.md의 완료 기준이 통과 판정 기준
- 지도는 `MapProvider` 인터페이스만 소비 — 컴포넌트에서 지도 SDK 직접 import 금지 (#2 카카오 폴백 전제)

## 함정 (gotcha)

- dev 서버 포트 **3010 고정**(`npm run dev`) — 3000은 사용자의 다른 앱이 사용. 지도(NCP)는 등록된 Web 서비스 URL과 포트까지 일치해야 인증됨. supabase/config.toml site_url도 3010

- 네이버 지역검색 `mapx/mapy`는 3형식(KATECH / WGS84×10⁷ / WGS84 도) — 값 크기로 판별, SPEC §알고리즘 1. 실측(T0-4) 결과 현재 API HUB는 WGS84×10⁷ 반환 (decision-log #20)
- iOS 설치형 PWA는 Safari와 세션 격리 — 인증은 OTP 코드 입력이 기본, 매직링크는 보조 (#13)
- 네이버 검색 응답 title에 `<b>` 태그 포함 — 프록시에서 제거
- PG enum 타입 대신 CHECK 제약 (enum은 값 추가 마이그레이션이 고통)
- 검색 쿼터 일 12,500 상한 상수 변경 시 docs/design/05·07도 함께 갱신

## 관례

- 사용자 대면 문구: 해요체·능동형·긍정형, CTA는 다음 행동 서술("보관함에 담기"). 에러 화면엔 항상 다음 행동 버튼
- API 에러는 RFC 9457 Problem JSON 통일
- 커밋 메시지 한글, 작업(tasks.md T번호) 단위 증분 커밋. 커밋·푸시는 사용자 요청 시에만

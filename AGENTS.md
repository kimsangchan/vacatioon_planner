# AGENTS.md — Trip Canvas

> 크로스툴 **단일 원본**. Claude Code는 `CLAUDE.md`의 `@import`로, Antigravity·Cursor는 네이티브로 읽는다.
> 얇게 유지(≤ ~4KB). 폴더 특유의 규칙은 그 폴더의 `CLAUDE.md`로 내린다.

## 세션 시작 — 먼저 이것부터

1. `NEXT.md`의 `NEXT-ACTION` 마커 사이 **현재-작업 블록**을 읽어라. 그게 지금 할 일이다.
2. 특정 폴더의 파일을 다룰 땐 그 폴더의 `CLAUDE.md`(스코프 규칙)를 그때 읽어라.
3. 지난 이력이 필요하면 `WORKLOG.md`를 본다(항상 읽을 필요는 없음).

## 프로젝트

개인용 여행 플래너 웹앱. 장소(식당·숙박·스팟)를 3클릭 내 저장해 지도+리스트 캔버스로 보고,
일차별로 배치하며, 이동(교통) 예매 정보(시각·가격·캡처)를 타임라인으로 한눈에 본다.

## 스택

Next.js 16.3 App Router · React 19 · TypeScript · Tailwind · Turbopack /
Supabase(Postgres + Auth + Storage) / vitest · pgTAP · Playwright

**Next.js 16 API는 학습 데이터와 다를 수 있다** — 코드 쓰기 전 `node_modules/next/dist/docs/`의
해당 가이드를 먼저 확인하라(하단 nextjs-agent-rules 블록).

## 진실원 (충돌 시 위가 우선)

`SPEC.md` → `tasks.md` → `docs/design/`(설계 근거·`decision-log.md` 결정 이력)

## 네비게이션 (무엇이 어디에)

- 다음 할 일(단일 출처): `NEXT.md` — SessionStart 훅이 마커 블록만 주입
- 히스토리/핸드오프: `WORKLOG.md`
- 스코프 규칙(온디맨드): `src/lib/` · `src/components/` · `supabase/` · `e2e/` 각 `CLAUDE.md`
- 설계 근거·결정: `docs/design/` (아래 `#번호`는 `docs/design/decision-log.md`의 결정 번호)
- 시크릿: `.env.local`(로컬)·`.env.example`(형식만). **키 값을 문서·커밋에 옮기지 마라**

## 명령

- `npm test`(vitest) · `npm run build` · `npm run lint` · `npm run test:e2e`(playwright)
  통합 테스트가 산발적으로 깨지면 `npx vitest run --no-file-parallelism` (로컬 Supabase 경합)
- `npx supabase start` / `npx supabase db reset`(마이그레이션 적용) / `npx supabase test db`(pgTAP)

## 반드시 (전역 — 어기면 설계 붕괴)

- **테스트 우선.** 기능 코드 전에 실패하는 테스트. `tasks.md`의 완료 기준이 통과 판정 기준
- **금액은 원 단위 정수.** 부동소수점 연산 금지 (#17)
- **일정 시각은 벽시계 값**(time/date, `trips.timezone` 기준). UTC 변환 저장 금지 —
  `created_at` 등 메타만 timestamptz (docs/design/05 §규약)
- **service role 키를 런타임 코드·env에 넣지 마라.** 운영 테이블 쓰기는 SECURITY DEFINER RPC 경유 (#11)
- **네이버 검색 키는 서버 전용** — `NEXT_PUBLIC_` 접두사 금지, 클라이언트 번들 노출 금지

## 함정 (전역)

- dev 서버 포트 **3010 고정**(`npm run dev`) — 3000은 사용자의 다른 앱이 사용.
  지도(NCP)는 콘솔 등록 Web 서비스 URL과 **포트까지** 일치해야 인증됨.
  `supabase/config.toml`의 site_url도 3010
- **dev 서버를 켜 둔 채 `npm run build` 금지** — `.next`가 깨져 "코드 문제처럼 보이는" 증상이 난다
- `package-lock.json`은 **리눅스에서** 만들어야 CI가 통과한다
- 폴더별 함정은 그 폴더의 `CLAUDE.md`에 있다 (`src/components/` · `supabase/` · `e2e/`)

## 관례

- 사용자 대면 문구: 해요체·능동형·긍정형, CTA는 다음 행동 서술("보관함에 담기").
  에러 화면엔 항상 다음 행동 버튼
- API 에러는 RFC 9457 Problem JSON 통일
- 커밋 메시지 한글, 작업(`tasks.md` T번호) 단위 증분 커밋. **커밋·푸시는 사용자 요청 시에만**

---

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

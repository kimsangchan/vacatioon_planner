<!-- NEXT-ACTION:START -->
## ▶ 지금 할 일 (새 세션은 이 블록부터 — SessionStart 훅이 자동 주입)

MVP 코드 작업은 T5-3까지 끝났다. 남은 건 T9(배포)이고, **선행 2건은 전부 사용자 작업**이다.

- **[대기·사용자] GitHub 저장소 생성 + 최초 푸시** — 지금 `git remote`가 비어 있어 커밋 전부가
  이 PC 디스크에만 있다(백업 0). T9-1(Vercel)·T9-2(Actions) 둘 다 저장소가 전제다. 프라이빗 권장.
- **[대기·사용자] T0-3** — Supabase **원격** 프로젝트 생성 + Auth 메일 템플릿 교체.
  형식은 `supabase/templates/magic_link.html`과 동일하게: 본문에 `{{ .Token }}`(6자리 코드) +
  링크 `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
  기본 템플릿엔 코드가 없어 FR-001이 불성립한다. 로컬 `.env.local`은 로컬 Supabase용이니 그대로 두고, 발급값은 Vercel env로.
- **[다음] T9-1** — Vercel 연결 + env 5종 등록 + Preview 배포 → 실기기(아이폰) 확인.
  **NCP 콘솔 Maps 앱에 배포 도메인 추가**도 함께(지금 등록된 건 `localhost:3010`뿐이라 배포 주소에선 지도 인증 실패).
  앵커: `tasks.md` T9 · `docs/design/07-ops-design.md`
<!-- NEXT-ACTION:END -->

<!--
규칙:
- 이 마커 사이는 "지금/다음 할 일" 1~3건만. 짧게(화면 한 판).
- 완료된 항목은 여기 두지 말고 WORKLOG.md 의 ## History 로 옮긴다 (단일 출처·비대 방지).
- 전체 작업 목록·백로그의 원본은 tasks.md — 여기 복사하지 않는다(위는 포인터만).
- 남은 백로그: T7-4(P2 공유 착수 시 get_shared_trip에 cost_amount) · T1-4(초기 커밋, 사실상 완료).
- 훅(tools/hooks/print_next_action.py)은 이 마커 사이만 세션에 주입한다.
-->

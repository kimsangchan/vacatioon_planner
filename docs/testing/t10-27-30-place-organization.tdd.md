# T10-27~30 TDD evidence

## Source and journeys

사용자 요청에서 직접 도출했다.

- 장소 영업시간을 빠르게 직접 적고 다시 열어도 읽을 수 있다.
- 많은 보관함 장소를 분류와 검색으로 좁힐 수 있다.
- 모바일 지도 확대 시 장소명을 누르지 않고 읽고, 줌·이동에도 좌표에서 떠나지 않는다.
- 같은 공유 링크를 열어 둔 사람도 최신 변경을 받는다.

## RED → GREEN

| Guarantee | RED evidence | GREEN evidence |
|---|---|---|
| `opening_hours` 저장·trim·줄바꿈·RLS 계약 | API 함수/컬럼 부재로 신규 Vitest 3건·pgTAP 4건 실패 | `npm test` 635/635, `npx supabase test db` 232/232 |
| 보관함 카테고리/검색/초기화/핀 reveal | 필터 모듈·UI 부재로 신규 unit/component 테스트 실패 | 관련 72/72 및 전체 Vitest 통과 |
| 줌 14 라벨·선택 라벨·HTML escape·좌표 anchor | `Pin.label`, threshold, label content 부재로 5건 실패 | 지도/번들 45/45 및 전체 Vitest 통과 |
| 공유 focus/visibility/manual refresh와 최신 projection | SharedTrip 5건 중 4건 실패, 신규 컬럼 부재로 projection pgTAP 실패 | SharedTrip 5/5, projection 12/12, 전체 pgTAP 통과 |

## Full verification

- `npm test` — 62 files, 635 tests PASS
- `npx supabase test db` — 13 files, 232 tests PASS
- `npx tsc --noEmit` — PASS
- `npm run lint` — PASS
- `npm run build` — PASS
- `npm run test:e2e` — 5/5 PASS; 여정 1에 보관함 필터와 영업시간 빠른 입력 포함

## Known gap

실제 네이버 지도에서 여러 장소명이 겹치는 시각적 밀도는 배포 후 모바일 육안 확인이 필요하다.
좌표 고정 자체는 같은 SDK Marker 객체의 position·anchor 불변 테스트로 검증했다.

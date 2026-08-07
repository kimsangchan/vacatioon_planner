# RECON — 여행 플래너 (조사일 2026-08-06)

## 도메인 업무 흐름 — 여행 계획은 실제로 어떻게 이뤄지는가

여행 계획의 표준 흐름은 4단계로 반복 검증된다 (Wanderlog·Triple·트랩플랜의 공통 기능 구조에서 역산):

1. **수집(Save)** — 지도앱·SNS·블로그에서 마음에 든 장소를 저장 목록에 쌓는다 (네이버지도 저장, 인스타 북마크)
2. **배치(Arrange)** — 저장한 장소를 날짜별·동선별로 배열한다 (지도를 보며 "이 날은 이 동네" 결정)
3. **확정(Book)** — 교통·숙박을 예매하고 예약 정보(시각·번호)를 기록한다
4. **여행 중 참조(On-trip)** — 이동하며 오늘 일정·다음 장소·예약 시각을 확인한다 (모바일, 한 손, 빠르게)

사용자 요청의 4개 카테고리는 이 흐름과 정확히 대응: 식당/숙박/스팟 = 수집·배치 대상, 이동 = 확정 단계 산출물.
출처: [Wanderlog 리뷰 (WhistleOut)](https://www.whistleout.com/CellPhones/Apps/wanderlog-group-trip-planning-app), [트립닷컴 여행 플래너 가이드](https://kr.trip.com/guide/info/%EC%97%AC%ED%96%89+%ED%94%8C%EB%9E%98%EB%84%88.html)

## 이해관계자 — 누가 쓰고 누가 돈을 내는가

- 1차 사용자: 개발자 본인 (아이폰, 네이버지도 사용 습관, 데스크톱에서 계획·모바일에서 참조로 추정)
- 2차 사용자(잠재): 동행자 — Wanderlog·트랩플랜·트리플 모두 "일정 공유"가 핵심 기능으로 검증됨
- 과금 주체: 없음(개인 프로젝트 추정) → 운영비 = API 비용 + 호스팅. **무료 티어 안에서 설계하는 것이 제약**
- 사용 주체 범위(개인용 vs 공개 서비스)는 A2 질문으로 승격 (백엔드·인증 복잡도를 좌우)

## 규제·표준 — 반드시 준수해야 하는 것

| 항목 | 내용 | 확인 근거 |
|---|---|---|
| 지도 API 약관 | 각 지도 SDK는 자사 지도 위 표시용으로만 데이터 사용 허용. 타사 지도에 타사 POI 데이터 혼용은 약관 위반 소지 (예: 구글 Places 데이터를 카카오맵에 표시) | [Google Places 사용·과금 정책](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), [카카오 로컬 API 문서](https://developers.kakao.com/docs/ko/local/common) |
| 네이버 지도 스크래핑 | 네이버지도 저장 목록·장소 상세 크롤링은 공식 API가 없고 약관 위반 리스크 → **연동 금지, 링크 파싱 수준까지만** | 공식 export API 부재 (검색 확인 2026-08-06, 아래 유사 솔루션 섹션) |
| 개인정보보호법 | 본인+소수 동행자 사용이면 개인정보처리자 의무 대부분 비해당. 공개 서비스 전환 시 처리방침·동의 필요 | 개인 이용 범위 — 공개 전환 시 재검토 조건으로 기록 |
| 해당 없음 확인 | 결제 없음(PCI-DSS 비해당), 의료·금융 데이터 없음 | seed 범위 기준 |

## 유사 솔루션 4개 — 실제 기능 범위

| 제품 | 핵심 기능 | 참고할 점 / 한계 | 출처 |
|---|---|---|---|
| **Wanderlog** | 지도+일정 통합 뷰, 실시간 공동 편집, 문서·예약 첨부, Pro는 동선 최적화 | 사용자 요청과 가장 유사한 검증 모델. 리스트↔지도 연동 뷰가 표준 패턴. 유료화(구독) 불만 다수 | [WhistleOut 리뷰](https://www.whistleout.com/CellPhones/Apps/wanderlog-group-trip-planning-app), [Wandrly 2026 리뷰](https://www.wandrly.app/reviews/wanderlog) |
| **트리플(Triple)** | 날짜별 일정 + 장소 간 거리 지도 표시, 일정 공유, 경비 정산, 항공·호텔 예약 연계 | 국내 사용자 표준 멘탈모델. 예약 커머스 중심이라 "기록 도구"로는 무거움 | [트리플 App Store](https://apps.apple.com/kr/app/id1225499481), [트립닷컴 앱 비교](https://kr.trip.com/guide/info/%EC%97%AC%ED%96%89%EC%95%B1.html) |
| **트랩플랜** | 타임라인·지도·캘린더 3뷰, 동행 초대, 예산·체크리스트 | 국내 신생. 멀티뷰(같은 데이터를 3가지 뷰로) 패턴 참고 | [App Store](https://apps.apple.com/kr/app/id6744748490) |
| **Google My Maps** | 지도에 커스텀 핀·레이어 저장 | "지도에 핀 찍기"만으로는 일정(날짜·시간·예약)을 못 담는다는 반증 사례 | [Google 내 지도 스키마](https://developers.google.com/data-portability/schema-reference/mymaps?hl=ko) |

**공백(우리 기회)**: 넷 다 "저장→지도 핀→호버/탭 사진 미리보기"의 마찰 없는 개인 기록에 최적화돼 있지 않다.
Wanderlog가 가장 가깝지만 영어권 POI 중심 + 구독 압박, 트리플은 예약 커머스 중심.

## 지도·장소 데이터 스택 조사 (핵심 결정 재료)

| 후보 | 지도 커버리지 | 장소 검색 | **사진 제공** | 비용 (2026-08 확인) | fit |
|---|---|---|---|---|---|
| **네이버지도 API (NCP Maps + 개발자센터 검색 API)** | 국내만, 해외 미지원 | 지역 검색 API (developers.naver.com) — 일 25,000회 무료, 이름·주소·카테고리·네이버 상세 링크·KATECH 좌표(mapx/mapy → WGS84 변환 필요) | ✗ (검색 API에 사진 없음) | 지도 렌더링은 NCP Maps: 구제품(AI NAVER API)은 신규 차단·무료 종료(2025)됐으나, **현행 NCP Maps는 Web Dynamic Map 월 1,000만 무료(대표 계정 1개 한정)** — 신규 계정의 무료 적용 여부는 가입 후 콘솔에서 확정 필요(잔여 리스크) | **국내 전용이면 중~높음** — 사용자 습관(네이버 상세 페이지 연결)과 일치. 리스크: 무료 이용량 조건 + 해외 불가 → 지도 제공자 추상화로 카카오 폴백 확보 |
| **카카오맵 API** | 국내만 | 로컬 API (키워드 검색, 좌표·카테고리·상세 URL) | ✗ (이미지·영업시간 미제공 — 공식 답변) | 무료 일 10만 / 월 300만 (로컬 API) | **국내 전용이면 높음** — 무료 쿼터 넉넉, 국내 POI 정확. 사진은 별도 해결 필요 |
| **Google Maps Platform** | 전 세계 | Places API (Text Search·Details) | ✓ (Place Photos) | 2025-03부터 SKU별 무료 티어(대개 월 1만 건). 사진 포함 Details는 Enterprise SKU $20/1k — 개인 사용량(월 수백 건)이면 무료 티어 내 | **해외 포함이면 유일 현실안** — 사진까지 한 API로. 국내 POI 품질은 카카오 대비 열세 |
| Leaflet + OSM | 전 세계 | Nominatim (POI 빈약) | ✗ | 무료 | 낮음 — 국내 POI·사진 모두 부족 |

출처: [네이버 지도 API 신규 차단·무료 종료 공지 (NCP)](https://www.ncloud.com/support/notice/all/1930), [NCP Maps 무료 이용량 FAQ](https://www.ncloud.com/support/faq/prod/2828), [카카오 로컬 API 문서](https://developers.kakao.com/docs/ko/local/dev-guide), [카카오 데브톡 — 검색 응답에 이미지 미제공](https://devtalk.kakao.com/t/topic/103965), [카카오 쿼터 정책](https://developers.kakao.com/docs/latest/ko/getting-started/quota), [Google Places 과금](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing), [Google Maps 요금 분석 (Woosmap, 2026)](https://www.woosmap.com/blog/google-maps-api-pricing-breakdown)

**핵심 발견 3건 (사용자 기대와 현실의 차이):**
1. **"네이버지도에서 저장하면 우리 앱에 뜬다"는 직접 연동 불가** — 네이버지도 저장 목록에는 공식 export/API가 없다. 현실 대안: (a) 앱 내 장소 검색으로 저장, (b) 네이버/카카오지도 공유 링크를 붙여넣으면 파싱해 등록.
2. **국내 지도 API는 사진을 안 준다** — 카카오·네이버 검색 API 모두 장소 사진 미제공. 호버 사진 미리보기를 하려면 구글 Places 사진, 사용자 직접 업로드, 또는 장소 상세 URL 링크 중 선택.
3. **네이버지도 API 무료 정책은 제품 세대에 따라 다르다** — 구제품(AI NAVER API) 종료 공지와 현행 NCP Maps 무료 이용량(웹 다이나믹맵 월 1,000만, 대표 계정 한정)이 혼재. 신규 계정 무료 적용은 가입 후 확정해야 하는 잔여 리스크 → 지도 제공자 추상화 계층으로 카카오맵 폴백을 설계에 내장한다.

## 사용자 결정 반영 (2026-08-06, A2 질문 배치 결과)

- 플랫폼: **반응형 웹 + PWA** (추천안 채택)
- 지도: **국내=네이버지도, 해외=구글 병행 — MVP는 국내(네이버)부터** (사용자 직접 지정). 시사점: ① 지도 제공자 추상화(MapProvider) 필수, ② 좌표는 WGS84로 정규화 저장(KATECH은 입수 시 변환), ③ 장소 사진 자동 수집은 네이버 검색 API가 미제공 → MVP는 사용자 업로드 + 네이버 상세 링크로 보완, 구글 병행 시 해외 장소만 자동 사진
- 사용 주체: **나 + 동행자 읽기전용 공유 링크** (추천안 채택)
- 장소 등록: **앱 내 검색 저장** (추천안 채택) — 네이버 지역 검색 API 사용, 링크 붙여넣기는 non-goal(2단계)

추가 출처: [네이버 지역 검색 API 사용기 (velog, 일 25,000회·응답 필드)](https://velog.io/@cyseok123/Spring-%EB%84%A4%EC%9D%B4%EB%B2%84-%EC%A7%80%EC%97%AD-%EA%B2%80%EC%83%89-API-%EC%82%AC%EC%9A%A9%ED%95%98%EA%B8%B0), [NCP Maps 무료 이용량 FAQ 항목 존재 확인](https://www.ncloud.com/support/faq/prod/2828)

잔여 확인 항목(구현 0단계): 지역 검색 25,000회/일의 1차 공식 문서(developers.naver.com)는 자동 접근 제한으로 블로그 교차 확인 상태 — 콘솔 가입 시 실측 확인. NCP Maps 무료 이용량의 신규 계정 적용 여부도 동일 시점 확인.

**정정 (2026-08-06 실측, T0 진행 중 발견)**: 네이버 개발자센터의 신규 애플리케이션 등록에 "검색" API가 더 이상 없음(사용자 실측). 검색 API는 **NCP NAVER API HUB**로 이관 — 지역 검색은 `GET /search/v1/local`, 인증은 `X-NCP-APIGW-API-KEY-ID`/`X-NCP-APIGW-API-KEY`, **응답 좌표 WGS84 기준**, display 최대 5, 콘솔 신청 화면 기준 일 25,000회 무료 제공. 출처: [API HUB 지역 검색 문서](https://api.ncloud-docs.com/docs/naver-api-hub-search-local), [NAVER API HUB 상품 페이지](https://www.ncloud.com/product/applicationService/naverApiHub) (확인 2026-08-06). 기존 블로그 출처들은 구세대(개발자센터) 절차라 신규 발급에는 무효.

## 플랫폼 조사 — 웹 vs 네이티브 (사용자 질문 대응)

- iOS PWA (2026): 홈 화면 추가 시 standalone 실행, iOS 26부터는 홈 화면 추가 사이트가 기본으로 웹앱으로 열림. 푸시 알림 iOS 16.4+ 지원(홈 화면 설치 필수). 한계: 설치 유도 프롬프트 없음, background sync 미지원, 저장소 제한.
- 개인용 여행 플래너에 필요한 기능(지도, 사진 표시, 오프라인 읽기 캐시)은 전부 PWA 범위 내. 푸시·백그라운드 동기화는 불필요하거나 우회 가능.
- **함정(GATE 1차 발견)**: iOS 설치형 PWA는 Safari와 스토리지가 격리된다 — 메일의 매직링크를 탭하면 세션이 Safari에 생기고 PWA는 미인증으로 남는다. 인증은 6자리 OTP 코드 병행이 필수 (04 반영).
- 네이티브 iOS는 Apple Developer Program 연 $99 + 심사 리스크 + Swift 학습 비용. 개인 사용이면 TestFlight/사이드로딩도 가능하나 유지 부담.
- 결론(추천): **반응형 웹 + PWA로 시작** — 데스크톱(계획 단계)과 아이폰(여행 중 참조)을 한 코드베이스로 커버. A2 질문으로 확정.

출처: [MagicBell PWA iOS 가이드 (2026)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), [MobiLoud PWA iOS 2026](https://www.mobiloud.com/blog/progressive-web-apps-ios), [OJapp PWA iOS 2026 실무 가이드](https://tips.ojapp.app/en/pwa-ios-2026-complete-guide/)

## 앱 스택 후보 (지도 결정과 독립)

| 레이어 | 추천 후보 | 근거 | 대안 |
|---|---|---|---|
| 프론트 | Next.js (React) + Tailwind | 지도 SDK(카카오·구글 모두 JS SDK 제공)와 호환, Vercel 무료 배포, PWA 플러그인 성숙 | Vite+React SPA (서버 불필요 시) |
| 백엔드·DB | Supabase (Postgres + Auth + Storage) | 무료 티어로 개인 규모 충분, 사진 업로드용 Storage 내장, 이메일 매직링크 인증 | Firebase, 로컬 IndexedDB(공유 불가) |
| 배포 | Vercel 무료 | Next.js 조합 표준, 커스텀 도메인 무료 | Cloudflare Pages |

스타 수·다운로드 추이는 A4에서 최종 스택 확정 시 재확인. fit 판단 기준: 1인 개발·무료 티어·지도 SDK 호환 (evidence-map.md 기준).

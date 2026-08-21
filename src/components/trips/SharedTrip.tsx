'use client'

// 공유 뷰 본체 (결정 #3·#46) — 읽기 전용 일정 + 별표.
//
// 캔버스(CanvasBoard)를 재사용하지 않는 이유: 그쪽은 담기·배치·삭제가 전부 붙어 있어
// 읽기 전용으로 쓰려면 프롭을 하나씩 꺼야 하고, 하나라도 빠뜨리면 남이 남의 여행을 고친다.
// 끄는 것보다 **처음부터 없는 편**이 안전하다.
//
// 지도를 함께 내는 이유: 어디를 가는지 목록만으로는 안 읽힌다 — 이 앱이 지도를 주인공으로 둔 이유와 같다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HeartVote } from '@/components/common/HeartVote'
import { naverMapSearchUrl } from '@/lib/place/map-link'
import { LEG_MODE_LABEL } from '@/lib/timeline/api'
import { mergeDayItems } from '@/lib/timeline/merge'
import { CategoryIcon } from '@/components/canvas/CategoryIcon'
import { MapPane } from '@/components/canvas/MapPane'
import { createMapProvider, type CreatedMapProvider } from '@/lib/map/create'
import { CATEGORY_COLOR_VAR } from '@/lib/map/provider'
import { toBytea } from '@/lib/share/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { saveVoterName, voterKey, voterName, VOTER_NAME_MAX } from '@/lib/vote/api'
import type { DayRow, LegRow, PlaceRow } from '@/lib/trips/bundle'

type SharedPlace = PlaceRow

/** 공유 링크가 받는 이동 — 예약번호·비용·메모·캡처는 오지 않는다 (0017) */
type SharedLeg = Pick<
  LegRow,
  | 'id'
  | 'day_id'
  | 'mode'
  | 'depart_at'
  | 'arrive_at'
  | 'arrive_day_offset'
  | 'from_label'
  | 'to_label'
  | 'position'
>
type SharedDay = Omit<DayRow, 'legs'> & { legs: SharedLeg[] }

interface SharedBundle {
  name: string
  start_date: string
  end_date: string
  days: SharedDay[]
  places: SharedPlace[]
}

/**
 * 보고 있는 동안 다시 읽는 주기 (결정 #61).
 *
 * **Supabase Realtime 은 못 쓴다**: 공유 화면은 anon 이고 anon 에는 테이블 권한이 아예 없다(0007).
 * postgres_changes 는 RLS 를 그대로 타므로 실시간을 켜려면 anon 에게 SELECT 를 열어야 하는데,
 * 그러면 bearer 링크 하나로 여행 전체가 열린다 — 결정 #11 을 정면으로 깬다.
 * 그래서 주기 조회다. 15초는 "고쳤는데 언제 반영되지" 를 안 묻게 하면서도
 * 안 보는 탭에는 한 번도 안 나가는 값이다.
 */
export const SHARED_REFRESH_MS = 15_000

interface Tally {
  place_id: string
  hearts: number
  mine: boolean
  names: string[]
}

/** "여기가 뭐 하는 데지" 에 답하는 세 가지 (결정 #62) — 업종·지도·가게 링크 */
function PlaceFacts({ place }: { place: SharedPlace }) {
  return (
    <>
      {place.images.length > 0 && (
        <span className="-mx-2 flex gap-1.5 overflow-x-auto px-2 py-0.5">
          {place.images.map((shot) => (
            <a
              key={shot.thumbnail}
              href={shot.link}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${place.name} 참고 사진 출처 열기`}
              className="shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.thumbnail}
                alt={`${place.name} 참고 사진`}
                width={88}
                height={88}
                loading="lazy"
                className="size-22 rounded-lg object-cover"
              />
            </a>
          ))}
        </span>
      )}
      {place.category_label !== '' && (
        <span className="truncate text-[12px] leading-tight text-fg-3">{place.category_label}</span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <a
          href={naverMapSearchUrl(place)}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`${place.name} 지도에서 보기`}
          className="font-medium text-fg-2 underline underline-offset-4"
        >
          지도에서 보기
        </a>
        {place.provider_link && (
          <a
            href={place.provider_link}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`${place.name} 홈페이지·SNS`}
            className="font-medium text-fg-2 underline underline-offset-4"
          >
            홈페이지·SNS
          </a>
        )}
      </span>
    </>
  )
}

function isInvalidShareError(error: { message?: string } | null): boolean {
  return error?.message?.includes('share/invalid-token') ?? false
}

function SharedTripForToken({ token }: { token: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [created] = useState<CreatedMapProvider>(() => createMapProvider())
  const [bundle, setBundle] = useState<SharedBundle | null>(null)
  const [tallies, setTallies] = useState<Tally[]>([])
  // 이름은 **한 번만** 적는다. 계정은 만들지 않는다 (#46) — 브라우저에 남을 뿐이다.
  // 안 적어도 하트는 눌린다: 그러면 수에만 들고 이름으로는 안 불린다
  const [name, setName] = useState(() =>
    typeof window === 'undefined' ? '' : voterName(window.localStorage),
  )
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const requestGeneration = useRef(0)
  const voteRevision = useRef(0)
  const hasBundle = useRef(false)
  const refreshInFlight = useRef(false)
  const lastAutomaticRefresh = useRef(0)
  const invalidShare = useRef(false)
  // 이 브라우저의 표 주인 (결정 #46). 서버에는 localStorage 가 없어 그때만 null 이다 —
  // 별표는 목록이 도착한 뒤에 그려지므로 하이드레이션과 부딪히지 않는다
  const [me] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : voterKey(window.localStorage),
  )
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const refresh = useCallback(async (automatic = false) => {
    if (refreshInFlight.current) return
    if (automatic) {
      const now = Date.now()
      if (
        invalidShare.current ||
        now - lastAutomaticRefresh.current < 2_000
      ) {
        return
      }
      lastAutomaticRefresh.current = now
    }

    refreshInFlight.current = true
    const generation = ++requestGeneration.current
    const votesAtRevision = voteRevision.current
    setRefreshing(true)

    // 일정 조회는 공개 토큰만으로 가능해야 한다. 별표 조회가 실패해도 일정은 보여 준다.
    const tripRequest = supabase.rpc('get_shared_trip', { token: toBytea(token) })
    const votesRequest = me
      ? supabase.rpc('get_shared_votes', { token: toBytea(token), voter_key: me })
      : null

    try {
      const trip = await tripRequest
      if (generation !== requestGeneration.current) return

      // 이미 읽은 일정이 있으면 일시적인 갱신 오류 때문에 화면을 지우지 않는다.
      if (trip.error || !trip.data) {
        if (!hasBundle.current || isInvalidShareError(trip.error)) {
          hasBundle.current = false
          invalidShare.current = isInvalidShareError(trip.error)
          setBundle(null)
          setFailed(true)
        }
        return
      }

      hasBundle.current = true
      invalidShare.current = false
      setFailed(false)
      setBundle(trip.data as SharedBundle)

      if (votesRequest) {
        const votes = await votesRequest
        if (
          generation === requestGeneration.current &&
          votesAtRevision === voteRevision.current &&
          !votes.error
        ) {
          setTallies((votes.data as Tally[] | null) ?? [])
        }
      }
    } finally {
      refreshInFlight.current = false
      if (generation === requestGeneration.current) setRefreshing(false)
    }
  }, [me, supabase, token])

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0)

    const refreshWhenFocused = () => void refresh(true)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    window.addEventListener('focus', refreshWhenFocused)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    // 가만히 둬도 최신이 되게 한다. 숨은 탭은 건너뛴다 — 안 보는 화면에 쿼터를 쓰지 않는다.
    // 겹쳐 도는 것은 refresh 의 2초 스로틀과 in-flight 가드가 막는다
    const tick = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true)
    }, SHARED_REFRESH_MS)

    return () => {
      requestGeneration.current += 1
      window.clearTimeout(initialRefresh)
      window.clearInterval(tick)
      window.removeEventListener('focus', refreshWhenFocused)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh])

  async function heart(placeId: string, hearted: boolean) {
    if (!me) return
    voteRevision.current += 1
    // 화면부터 먼저 움직인다 — 눌렀는데 아무 반응이 없으면 한 번 더 누른다
    setTallies((was) => {
      const previous = was.find((t) => t.place_id === placeId)
      const wasMine = previous?.mine ?? false
      const rest = was.filter((t) => t.place_id !== placeId)
      const others = (previous?.names ?? []).filter((n) => n !== name || !wasMine)
      return [
        ...rest,
        {
          place_id: placeId,
          hearts: (previous?.hearts ?? 0) + (hearted ? (wasMine ? 0 : 1) : wasMine ? -1 : 0),
          mine: hearted,
          names: hearted && name !== '' ? [...others, name] : others,
        },
      ]
    })
    const result = await supabase.rpc('heart_shared_place', {
      token: toBytea(token),
      place_id: placeId,
      voter_key: me,
      voter_name: name,
      hearted,
    })
    if (result.error) void refresh()
  }

  if (failed) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-5 py-12">
        <h1 className="text-[24px] font-bold tracking-tight">링크가 열리지 않아요</h1>
        <p className="text-fg-2">
          링크가 꺼졌거나 주소가 조금 다른 것 같아요. 링크를 준 분에게 다시 받아 주세요.
        </p>
      </div>
    )
  }

  if (!bundle) {
    return <p className="px-5 py-12 text-fg-3">여행을 불러오는 중이에요.</p>
  }

  // 아직 일차에 안 넣은 후보 — 동행자가 하트를 줄 대상이 "이미 정해진 곳" 뿐이면
  // "어디 갈지 같이 정하자"(#46)가 성립하지 않는다 (결정 #60)
  const assigned = new Set(
    bundle.days.flatMap((day) => (day.stops ?? []).map((stop) => stop.place_id)),
  )
  const candidates = bundle.places.filter((place) => !assigned.has(place.id))

  const tallyOf = (placeId: string): Omit<Tally, 'place_id'> =>
    tallies.find((t) => t.place_id === placeId) ?? { hearts: 0, mine: false, names: [] }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-5">
        <h1 className="truncate text-[18px] font-semibold">{bundle.name}</h1>
        <span className="tabular shrink-0 text-[13px] text-fg-3">
          {bundle.start_date.replaceAll('-', '.')} ~ {bundle.end_date.replaceAll('-', '.')}
        </span>
        <span className="ml-auto hidden shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg-3 sm:inline-flex">
          같이 보는 중
        </span>
        <button
          type="button"
          onClick={() => void refresh(false)}
          aria-label="최신 정보 새로고침"
          aria-busy={refreshing}
          disabled={refreshing}
          className="shrink-0 rounded-m border border-line px-3 py-1.5 text-[12px] font-medium text-fg-2 transition-colors hover:bg-surface-2"
        >
          {refreshing ? '새로고침 중' : '새로고침'}
        </button>
      </header>

      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-line px-4 py-4 md:w-[380px] md:flex-none md:border-r md:px-6">
          <p className="text-[13px] leading-relaxed text-fg-2">
            가고 싶은 곳에 <strong className="font-semibold text-fg">하트</strong>를 눌러 주세요.
            일정은 고칠 수 없어요.
          </p>

          {/* 이름을 한 번 적어 두면 하트에 이름이 붙는다. 안 적어도 누를 수 있다 —
              계정을 만들지 않는 도구라 이름도 강요하지 않는다 (#46) */}
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <span className="shrink-0">이름</span>
            <input
              value={name}
              maxLength={VOTER_NAME_MAX}
              placeholder="안 적어도 괜찮아요"
              onChange={(event) => setName(saveVoterName(window.localStorage, event.target.value))}
              className="min-h-11 min-w-0 flex-1 rounded-m border border-line bg-surface-2 px-3 text-base outline-none transition-colors duration-120 placeholder:text-fg-4 focus:border-[1.5px] focus:border-brand focus:bg-surface"
            />
          </label>

          {bundle.days.map((day, index) => {
            // 순서의 진실은 stops∪legs 통합 position 하나다 (#15).
            // 이동을 목록 끝에 몰아 두면 "밥 먹고 기차" 인지 "기차 타고 밥" 인지가 거짓말이 된다
            const stops = day.stops ?? []
            const legs = day.legs ?? []
            const legById = new Map(legs.map((leg) => [leg.id, leg]))
            const stopById = new Map(stops.map((stop) => [stop.id, stop]))
            const items = mergeDayItems(
              stops,
              legs.map((leg) => ({ ...leg, cost_amount: null })),
            )
            return (
            <div key={day.id} className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-fg-2">
                {index + 1}일차
                <span className="tabular ml-1.5 font-normal text-fg-3">
                  {day.date.replaceAll('-', '.')}
                </span>
              </h2>
              {items.length === 0 ? (
                <p className="text-[13px] text-fg-3">아직 담긴 곳이 없어요.</p>
              ) : (
                <ul className="flex flex-col">
                  {items.map((item) => {
                    if (item.kind === 'leg') {
                      const leg = legById.get(item.id)
                      if (!leg) return null
                      return (
                        <li
                          key={leg.id}
                          className="flex flex-col gap-0.5 px-2 py-2 text-[13px] text-fg-2"
                        >
                          <span className="font-medium text-fg">
                            {LEG_MODE_LABEL[leg.mode]} ·{' '}
                            <span className="tabular">
                              {leg.depart_at.slice(0, 5)}→{leg.arrive_at.slice(0, 5)}
                            </span>
                            {leg.arrive_day_offset > 0 && ` +${leg.arrive_day_offset}일`}
                          </span>
                          <span className="truncate text-fg-3">
                            {leg.from_label || '출발지 미정'} → {leg.to_label || '도착지 미정'}
                          </span>
                        </li>
                      )
                    }
                    const stop = stopById.get(item.id)
                    if (!stop) return null
                    const place = (
                      stop.place ?? bundle.places.find((item) => item.id === stop.place_id) ?? null
                    ) as SharedPlace | null
                    if (!place) return null
                    const tally = tallyOf(place.id)
                    return (
                      <li
                        key={stop.id}
                        onMouseEnter={() => setHighlightedId(place.id)}
                        onMouseLeave={() => setHighlightedId(null)}
                        // 별이 손가락 크기(44px)라 이름 옆에 두면 이름이 눌린다 — 제 줄로 내린다.
                        // 좌측 열은 데스크톱에서도 380px 라 가로로는 어차피 자리가 없다
                        className="flex flex-col gap-1 rounded-m px-2 py-2 transition-colors duration-120 hover:bg-surface-2"
                      >
                        <span className="flex items-center gap-3">
                          <CategoryIcon
                            category={place.category}
                            color={CATEGORY_COLOR_VAR[place.category]}
                            size={14}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="truncate text-[17px] leading-tight font-semibold">
                              {place.name}
                            </span>
                            <span className="truncate text-[13px] leading-tight text-fg-3">
                              {place.road_address || place.address}
                            </span>
                            {place.opening_hours ? (
                              <span className="whitespace-pre-line text-[12px] leading-relaxed text-fg-3">
                                영업시간 {place.opening_hours}
                              </span>
                            ) : null}
                            <PlaceFacts place={place} />
                            {place.phone ? (
                              <a
                                href={`tel:${place.phone}`}
                                className="w-fit text-[12px] font-medium text-fg-2 underline underline-offset-4"
                              >
                                {place.phone}
                              </a>
                            ) : null}
                          </span>
                        </span>
                        <HeartVote
                          label={place.name}
                          hearts={tally.hearts}
                          mine={tally.mine}
                          names={tally.names}
                          onToggle={(hearted) => void heart(place.id, hearted)}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            )
          })}

          {candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-fg-2">
                보관함
                <span className="ml-1.5 font-normal text-fg-3">{candidates.length}곳</span>
              </h2>
              <p className="text-[12px] leading-relaxed text-fg-3">
                아직 일정에 넣지 않은 곳이에요. 가고 싶은 곳에 하트를 눌러 주세요.
              </p>
              <ul className="flex flex-col">
                {candidates.map((place) => {
                  const tally = tallyOf(place.id)
                  return (
                    <li
                      key={place.id}
                      onMouseEnter={() => setHighlightedId(place.id)}
                      onMouseLeave={() => setHighlightedId(null)}
                      className="flex flex-col gap-1 rounded-m px-2 py-2 transition-colors duration-120 hover:bg-surface-2"
                    >
                      <span className="flex items-center gap-3">
                        <CategoryIcon
                          category={place.category}
                          color={CATEGORY_COLOR_VAR[place.category]}
                          size={14}
                        />
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[17px] leading-tight font-semibold">
                            {place.name}
                          </span>
                          <span className="truncate text-[13px] leading-tight text-fg-3">
                            {place.road_address || place.address}
                          </span>
                          <PlaceFacts place={place} />
                        </span>
                      </span>
                      <HeartVote
                        label={place.name}
                        hearts={tally.hearts}
                        mine={tally.mine}
                        names={tally.names}
                        onToggle={(hearted) => void heart(place.id, hearted)}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </aside>

        {/* 부모를 relative 로 두고 absolute 로 채운다 — flex 아이템 안에서 h-full 은 기준을 못 잡아
            지도가 0px 이 되고 백지로 뜬다 (src/components/CLAUDE.md 함정) */}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <MapPane
              created={created}
              places={bundle.places}
              days={bundle.days}
              highlightedId={highlightedId}
              onPinEvent={(id) => setHighlightedId(id)}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

export function SharedTrip({ token }: { token: string }) {
  return <SharedTripForToken key={token} token={token} />
}

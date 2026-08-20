'use client'

// 공유 뷰 본체 (결정 #3·#46) — 읽기 전용 일정 + 별표.
//
// 캔버스(CanvasBoard)를 재사용하지 않는 이유: 그쪽은 담기·배치·삭제가 전부 붙어 있어
// 읽기 전용으로 쓰려면 프롭을 하나씩 꺼야 하고, 하나라도 빠뜨리면 남이 남의 여행을 고친다.
// 끄는 것보다 **처음부터 없는 편**이 안전하다.
//
// 지도를 함께 내는 이유: 어디를 가는지 목록만으로는 안 읽힌다 — 이 앱이 지도를 주인공으로 둔 이유와 같다.

import { useEffect, useMemo, useState } from 'react'
import { StarRating } from '@/components/common/StarRating'
import { CategoryIcon } from '@/components/canvas/CategoryIcon'
import { MapPane } from '@/components/canvas/MapPane'
import { createMapProvider, type CreatedMapProvider } from '@/lib/map/create'
import { CATEGORY_COLOR_VAR } from '@/lib/map/provider'
import { toBytea } from '@/lib/share/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { voterKey, type Stars } from '@/lib/vote/api'
import type { DayRow, PlaceRow } from '@/lib/trips/bundle'

interface SharedBundle {
  name: string
  start_date: string
  end_date: string
  days: DayRow[]
  places: PlaceRow[]
}

interface Tally {
  place_id: string
  total: number
  voters: number
  mine: number
}

export function SharedTrip({ token }: { token: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [created] = useState<CreatedMapProvider>(() => createMapProvider())
  const [bundle, setBundle] = useState<SharedBundle | null>(null)
  const [tallies, setTallies] = useState<Tally[]>([])
  const [failed, setFailed] = useState(false)
  // 이 브라우저의 표 주인 (결정 #46). 서버에는 localStorage 가 없어 그때만 null 이다 —
  // 별표는 목록이 도착한 뒤에 그려지므로 하이드레이션과 부딪히지 않는다
  const [me] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : voterKey(window.localStorage),
  )
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  useEffect(() => {
    if (!me) return
    let alive = true
    void (async () => {
      const [trip, votes] = await Promise.all([
        supabase.rpc('get_shared_trip', { token: toBytea(token) }),
        supabase.rpc('get_shared_votes', { token: toBytea(token), voter_key: me }),
      ])
      if (!alive) return
      // 해제·오타를 구분하지 않는다 — 링크를 준 사람에게 물어보라는 말이 유일한 다음 행동이다
      if (trip.error || !trip.data) {
        setFailed(true)
        return
      }
      setBundle(trip.data as SharedBundle)
      setTallies((votes.data as Tally[] | null) ?? [])
    })()
    return () => {
      alive = false
    }
  }, [supabase, token, me])

  async function vote(placeId: string, stars: 0 | Stars) {
    if (!me) return
    // 화면부터 먼저 움직인다 — 별을 눌렀는데 아무 반응이 없으면 한 번 더 누른다
    setTallies((was) => {
      const previous = was.find((t) => t.place_id === placeId)
      const mine = previous?.mine ?? 0
      const rest = was.filter((t) => t.place_id !== placeId)
      const next = {
        place_id: placeId,
        total: (previous?.total ?? 0) - mine + stars,
        voters: (previous?.voters ?? 0) + (mine === 0 && stars > 0 ? 1 : 0) - (mine > 0 && stars === 0 ? 1 : 0),
        mine: stars,
      }
      return [...rest, next]
    })
    await supabase.rpc('vote_shared_place', {
      token: toBytea(token),
      place_id: placeId,
      voter_key: me,
      stars,
    })
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

  const tallyOf = (placeId: string) =>
    tallies.find((t) => t.place_id === placeId) ?? { total: 0, voters: 0, mine: 0 }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline gap-3 border-b border-line px-4 py-3 md:px-5">
        <h1 className="truncate text-[18px] font-semibold">{bundle.name}</h1>
        <span className="tabular shrink-0 text-[13px] text-fg-3">
          {bundle.start_date.replaceAll('-', '.')} ~ {bundle.end_date.replaceAll('-', '.')}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg-3">
          같이 보는 중
        </span>
      </header>

      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto border-line px-4 py-4 md:w-[380px] md:flex-none md:border-r md:px-6">
          <p className="text-[13px] leading-relaxed text-fg-2">
            가고 싶은 곳에 <strong className="font-semibold text-fg">별표</strong>를 남겨 주세요.
            일정은 고칠 수 없어요.
          </p>

          {bundle.days.map((day, index) => (
            <div key={day.id} className="flex flex-col gap-2">
              <h2 className="text-[13px] font-semibold text-fg-2">
                {index + 1}일차
                <span className="tabular ml-1.5 font-normal text-fg-3">
                  {day.date.replaceAll('-', '.')}
                </span>
              </h2>
              {day.stops.length === 0 ? (
                <p className="text-[13px] text-fg-3">아직 담긴 곳이 없어요.</p>
              ) : (
                <ul className="flex flex-col">
                  {day.stops.map((stop) => {
                    const place =
                      stop.place ?? bundle.places.find((item) => item.id === stop.place_id) ?? null
                    if (!place) return null
                    const tally = tallyOf(place.id)
                    return (
                      <li
                        key={stop.id}
                        onMouseEnter={() => setHighlightedId(place.id)}
                        onMouseLeave={() => setHighlightedId(null)}
                        className="flex items-center gap-3 rounded-m px-2 py-2 transition-colors duration-120 hover:bg-surface-2"
                      >
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
                        </span>
                        <StarRating
                          label={place.name}
                          mine={tally.mine}
                          total={tally.total}
                          voters={tally.voters}
                          onChange={(stars) => void vote(place.id, stars)}
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ))}
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

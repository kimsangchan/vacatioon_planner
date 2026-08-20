'use client'

// E-06 Trip Bundle 을 react-query 로 들고 캔버스에 넘긴다. 저장(E-04) 성공 시 번들만 다시 읽는다 —
// 화면 전체를 새로 그리지 않고 보관함·핀이 같이 갱신되게 하려는 것.

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { deletePhoto, setCoverPhoto, uploadTripPhoto } from '@/lib/photo/upload'
import {
  restorePlace,
  savePlace,
  softDeletePlace,
  updatePlaceEstimatedCost,
  updatePlaceMemo,
} from '@/lib/place/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  TimelineError,
  placeStops,
  removeLeg,
  removeStop,
  reorderDayItems,
  saveLeg,
  timelineErrorMessage,
  updateStop,
  type LegDraft,
} from '@/lib/timeline/api'
import { nextPosition } from '@/lib/timeline/merge'
import type { DayColor } from '@/lib/map/day-color'
import {
  TripError,
  renameTrip,
  tripErrorMessage,
  updateDayColor,
  updateTripDates,
} from '@/lib/trips/api'
import {
  fetchTripBundle,
  tripBundleKey,
  type DayRow,
  type PhotoRow,
  type PlaceRow,
} from '@/lib/trips/bundle'
import { dateChangeNotice } from '@/lib/trips/dates'
import { shortPeriod } from '@/lib/trips/dates'
import { disableShare, enableShare, toHex } from '@/lib/share/api'
import { saveMyVote, voterKey, type Stars } from '@/lib/vote/api'
import { ShareButton } from '@/components/trips/ShareButton'
import { CanvasBoard } from './CanvasBoard'
import type { PlaceDraft } from './PlaceSearchBox'
import { TripDatesForm } from './TripDatesForm'
import { TripTitleField } from './TripTitleField'

// 알림 줄 하나로 두 가지를 말한다: 방금 무엇이 됐는지, 그리고 되돌릴 수 있다면 그 자리 (T-06)
interface CanvasNotice {
  text: string
  undo?: { label: string; run: () => Promise<void> }
}

export interface TripCanvasProps {
  tripId: string
  ownerId: string
}

export function TripCanvas({ tripId, ownerId }: TripCanvasProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <TripCanvasView tripId={tripId} ownerId={ownerId} />
    </QueryClientProvider>
  )
}

function TripCanvasView({ tripId, ownerId }: TripCanvasProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const queryClient = useQueryClient()
  const [scheduleFailure, setScheduleFailure] = useState<string | null>(null)
  const [notice, setNotice] = useState<CanvasNotice | null>(null)
  const [editingDates, setEditingDates] = useState(false)
  // 기간 폼을 펼치면 캔버스의 미리보기 시트를 닫는다 — 강조 CTA 는 화면당 하나다 (L-09).
  // 시트 상태는 CanvasBoard 가 쥐고 있어 값이 바뀐 것만 신호로 보낸다
  const [editorSignal, setEditorSignal] = useState(0)

  const bundleQuery = useQuery({
    queryKey: tripBundleKey(tripId),
    queryFn: () => fetchTripBundle(supabase, tripId),
  })

  const refetchBundle = () => queryClient.invalidateQueries({ queryKey: tripBundleKey(tripId) })

  // 별표 협의 (결정 #46) — 주인은 RLS 경유로 바로 쓴다. 공유 링크로 들어온 사람은 RPC 를 거친다
  // 공유 링크 (결정 #3) — 켜기를 다시 누르면 새 토큰이 나오고 그게 곧 이전 링크 무효화다
  const turnOnShare = useMutation({
    mutationFn: () => enableShare(supabase, tripId),
    onSuccess: refetchBundle,
  })
  const turnOffShare = useMutation({
    mutationFn: () => disableShare(supabase, tripId),
    onSuccess: refetchBundle,
  })

  const votePlace = useMutation({
    mutationFn: ({ placeId, stars }: { placeId: string; stars: 0 | Stars }) =>
      saveMyVote(supabase, { placeId, voterKey: voterKey(window.localStorage), stars }),
    onSuccess: refetchBundle,
  })

  const save = useMutation({
    mutationFn: (draft: PlaceDraft) =>
      // PK 는 클라이언트가 만든다 — 재시도해도 한 행 (05 §멱등성)
      savePlace(supabase, {
        id: crypto.randomUUID(),
        trip_id: tripId,
        owner_id: ownerId,
        ...draft,
      }),
    onSuccess: refetchBundle,
  })

  // E-05 — 리사이즈·업로드·photos 행이 한 덩어리다 (lib/photo/upload.ts)
  const addPhoto = useMutation({
    mutationFn: ({ placeId, file }: { placeId: string; file: File }) =>
      uploadTripPhoto(supabase, { file, target: { place_id: placeId } }),
    onSuccess: refetchBundle,
  })

  // FR-018 — 예매 캡처는 Leg 에 붙는다. 첨부 대상은 하나뿐이다 (E-05 parent-exclusive)
  const addLegPhoto = useMutation({
    mutationFn: ({ legId, file }: { legId: string; file: File }) =>
      uploadTripPhoto(supabase, { file, target: { leg_id: legId } }),
    onSuccess: refetchBundle,
  })

  const changeCover = useMutation({
    mutationFn: ({ placeId, photoId }: { placeId: string; photoId: string }) =>
      setCoverPhoto(supabase, { placeId, photoId }),
    onSuccess: refetchBundle,
  })

  // E-12 — 사진·Leg 는 hard delete 라 화면에서 먼저 확인을 받은 뒤에 온다
  const dropPhoto = useMutation({
    mutationFn: (photo: PhotoRow) => deletePhoto(supabase, photo),
    onSuccess: refetchBundle,
  })

  const dropLeg = useMutation({
    mutationFn: (legId: string) => removeLeg(supabase, legId),
    onSuccess: refetchBundle,
  })

  // E-12 — Place 는 soft delete. 배치된 Stop 은 함께 사라지고(미리 알린 대로), 되돌리면 보관함으로 온다
  const dropPlace = useMutation({
    mutationFn: (placeId: string) => softDeletePlace(supabase, placeId),
    onSuccess: refetchBundle,
  })

  const undropPlace = useMutation({
    mutationFn: (placeId: string) => restorePlace(supabase, placeId),
    onSuccess: refetchBundle,
  })

  // E-14 — Day 증감·Stop 제거가 한 트랜잭션이라, 화면은 반환 카운트만 옮기면 된다 (FR-015)
  const changeDates = useMutation({
    mutationFn: (input: { start_date: string; end_date: string }) =>
      updateTripDates(supabase, { trip_id: tripId, ...input }),
    onSuccess: refetchBundle,
  })

  // FR-002 — 이름은 헤더에서 고친다 (새 여행은 이름 없이 시작한다 · 결정 #27)
  const rename = useMutation({
    mutationFn: (name: string) => renameTrip(supabase, tripId, name),
    onSuccess: refetchBundle,
  })

  // E-09 — 메모는 카드에서 바로 고친다 (FR-009)
  const saveMemo = useMutation({
    mutationFn: ({ placeId, memo }: { placeId: string; memo: string }) =>
      updatePlaceMemo(supabase, placeId, memo),
    onSuccess: refetchBundle,
  })

  // 예상 금액도 같은 카드에서 고친다 (결정 #39)
  const saveEstimatedCost = useMutation({
    mutationFn: ({ placeId, estimatedCost }: { placeId: string; estimatedCost: number | null }) =>
      updatePlaceEstimatedCost(supabase, placeId, estimatedCost),
    onSuccess: refetchBundle,
  })

  // 일차 색 (결정 #41) — 지도 핀 색이 여기서 정해진다
  const setDayColor = useMutation({
    mutationFn: ({ dayId, color }: { dayId: string; color: DayColor }) =>
      updateDayColor(supabase, dayId, color),
    onSuccess: refetchBundle,
  })

  // ── T7 일정 (E-07·E-08) ────────────────────────────────────────────────────
  // 새 항목의 자리는 그 Day 의 Stop∪Leg 맨 뒤다 — position 은 한 시퀀스다 (결정 #15)
  const dayOf = (dayId: string): DayRow | undefined =>
    bundleQuery.data?.days.find((day) => day.id === dayId)

  const tailPosition = (dayId: string): number => {
    const day = dayOf(dayId)
    return nextPosition(day?.stops ?? [], day?.legs ?? [])
  }

  const assignPlace = useMutation({
    mutationFn: ({ placeId, dayId }: { placeId: string; dayId: string }) =>
      placeStops(supabase, [
        {
          id: crypto.randomUUID(),
          day_id: dayId,
          place_id: placeId,
          position: tailPosition(dayId),
        },
      ]),
    onSuccess: refetchBundle,
  })

  const unassignStop = useMutation({
    mutationFn: (stopId: string) => removeStop(supabase, stopId),
    onSuccess: refetchBundle,
  })

  const changeStop = useMutation({
    mutationFn: ({
      stopId,
      patch,
    }: {
      stopId: string
      patch: { start_time?: string | null; cost_amount?: number | null; confirmed?: boolean }
    }) => updateStop(supabase, stopId, patch),
    onSuccess: refetchBundle,
  })

  const reorderDay = useMutation({
    mutationFn: ({ dayId, orderedIds }: { dayId: string; orderedIds: string[] }) =>
      reorderDayItems(supabase, dayId, orderedIds),
    onSuccess: refetchBundle,
  })

  const storeLeg = useMutation({
    mutationFn: ({ dayId, draft, legId }: { dayId: string; draft: LegDraft; legId?: string }) =>
      saveLeg(supabase, {
        id: legId ?? crypto.randomUUID(),
        day_id: dayId,
        position: legId ? (dayOf(dayId)?.legs.find((leg) => leg.id === legId)?.position ?? 0) : tailPosition(dayId),
        ...draft,
      }),
    onSuccess: refetchBundle,
  })

  // 일정 조작은 폼 밖에서 일어나기도 한다(순서 버튼·되돌리기) — 실패를 삼키지 않고
  // 다음 행동과 함께 한 줄로 알린다 (SPEC §UI 규칙 — 막다른 에러 금지)
  async function guard(action: () => Promise<unknown>): Promise<void> {
    setScheduleFailure(null)
    try {
      await action()
    } catch (error) {
      setScheduleFailure(
        timelineErrorMessage(error instanceof TimelineError ? error.code : 'unknown'),
      )
    }
  }

  if (bundleQuery.isPending) {
    return (
      <p className="px-5 py-12 text-base text-fg-2 sm:px-8">
        여행을 불러오고 있어요.
      </p>
    )
  }

  if (bundleQuery.isError) {
    const error = bundleQuery.error
    // 여기는 "읽기" 실패다 — 쓰기용 기본 문구(unknown)를 그대로 쓰면 제목과 어긋난다
    const message =
      error instanceof TripError && error.code !== 'unknown'
        ? tripErrorMessage(error.code)
        : '잠시 뒤에 다시 열어 보거나, 목록에서 다시 골라 주세요.'

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-5 py-12 sm:px-8">
        <h2 className="text-xl font-semibold tracking-tight">여행을 열지 못했어요</h2>
        <p className="text-base text-fg-2">{message}</p>
        <Link
          href="/"
          className="flex min-h-12 items-center justify-center rounded-l bg-brand px-5 text-[17px] font-bold text-white transition-opacity hover:opacity-90"
        >
          여행 목록 보기
        </Link>
      </div>
    )
  }

  const bundle = bundleQuery.data
  const undo = notice?.undo

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-2 px-4 pt-4 pb-3 md:px-5">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="flex min-h-8 shrink-0 items-center text-[13px] font-medium text-fg-3 transition-colors duration-120 hover:text-fg"
          >
            여행 목록
          </Link>
          <TripTitleField
            name={bundle.name}
            onRename={(name) => rename.mutateAsync(name)}
            // 이름과 기간 편집기가 겹치면 강조 CTA 가 둘이 된다 (L-09) — 양방향으로 닫는다
            onOpen={() => setEditingDates(false)}
            closeSignal={editorSignal}
          />
          {/* 기간은 읽을 거리이자 손잡이다 — 누르면 그 자리에서 고친다 (FR-015, 모달 금지) */}
          <button
            type="button"
            aria-expanded={editingDates}
            onClick={() => {
              if (!editingDates) setEditorSignal((value) => value + 1)
              setEditingDates((open) => !open)
              setNotice(null)
            }}
            className="flex min-h-8 items-center text-sm text-fg-3 underline underline-offset-4"
          >
            {shortPeriod(bundle.start_date, bundle.end_date)}
            <span className="sr-only"> 기간 고치기</span>
          </button>

          {/* 같이 보기 — 동행자를 부르는 유일한 문이다 (결정 #3·#46).
              오른쪽 끝에 두는 이유: 이 화면의 주 행동은 장소를 담는 것이고, 공유는 다 담고 나서 한다 */}
          <div className="ml-auto self-center">
            <ShareButton
              enabled={bundle.share_enabled === true}
              token={bundle.share_token ? toHex(bundle.share_token) : null}
              onEnable={async () => void (await turnOnShare.mutateAsync())}
              onDisable={() => turnOffShare.mutateAsync()}
            />
          </div>
        </div>

        {editingDates && (
          <TripDatesForm
            startDate={bundle.start_date}
            endDate={bundle.end_date}
            days={bundle.days}
            onCancel={() => setEditingDates(false)}
            onSubmit={async (startDate, endDate) => {
              const change = await changeDates.mutateAsync({
                start_date: startDate,
                end_date: endDate,
              })
              setEditingDates(false)
              setNotice({ text: dateChangeNotice(change) })
            }}
          />
        )}
      </header>

      {notice && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-3 px-4 pb-2 text-sm md:px-5"
        >
          {notice.text}
          {undo && (
            <button
              type="button"
              onClick={() => {
                setNotice(null)
                void guard(undo.run)
              }}
              className="flex min-h-8 items-center rounded-full border border-line px-3 text-xs font-medium"
            >
              {undo.label}
            </button>
          )}
        </p>
      )}

      {scheduleFailure && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-2 px-4 pb-2 text-sm md:px-5"
        >
          {scheduleFailure}
          <button
            type="button"
            onClick={() => {
              setScheduleFailure(null)
              void refetchBundle()
            }}
            className="flex min-h-8 items-center rounded-full border border-line px-3 text-xs"
          >
            여행 다시 불러오기
          </button>
        </p>
      )}

      <CanvasBoard
        bundle={bundle}
        editorSignal={editorSignal}
        onSave={async (draft) => {
          // 새 장소 id 를 돌려준다 — 캔버스가 저장 직후 그 곳을 지도에 띄우는 데 쓴다 (결정 #50)
          const saved = await save.mutateAsync(draft)
          return saved.id
        }}
        onAssignPlace={(placeId, dayId) => guard(() => assignPlace.mutateAsync({ placeId, dayId }))}
        onVotePlace={(placeId, stars) => guard(() => votePlace.mutateAsync({ placeId, stars }))}
        onUnassignStop={(stopId) => guard(() => unassignStop.mutateAsync(stopId))}
        onUpdateStop={(stopId, patch) => guard(() => changeStop.mutateAsync({ stopId, patch }))}
        onReorderDay={(dayId, orderedIds) =>
          guard(() => reorderDay.mutateAsync({ dayId, orderedIds }))
        }
        onSaveLeg={async (dayId, draft, legId) => {
          // 이동 폼은 제 안에서 오류를 말한다 (validation/time-reversed 등) — 그대로 올려보낸다
          await storeLeg.mutateAsync({ dayId, draft, legId })
        }}
        onAddPhoto={async (placeId, file) => {
          await addPhoto.mutateAsync({ placeId, file })
        }}
        onAddLegPhoto={async (legId, file) => {
          await addLegPhoto.mutateAsync({ legId, file })
        }}
        onSetCover={async (placeId, photoId) => {
          await changeCover.mutateAsync({ placeId, photoId })
        }}
        onRemovePhoto={async (photo) => {
          await dropPhoto.mutateAsync(photo)
        }}
        onRemoveLeg={(legId) => guard(() => dropLeg.mutateAsync(legId))}
        onDeletePlace={async (place: PlaceRow) => {
          await dropPlace.mutateAsync(place.id)
          // 되돌리기는 여기 한 줄이 전부다 — 장소는 90일 안이면 그대로 돌아온다 (FR-017)
          setNotice({
            text: `‘${place.name}’ 장소를 보관함에서 뺐어요.`,
            undo: {
              label: '되돌리기',
              run: async () => {
                await undropPlace.mutateAsync(place.id)
              },
            },
          })
        }}
        onSaveMemo={async (placeId, memo) => {
          await saveMemo.mutateAsync({ placeId, memo })
        }}
        onSaveEstimatedCost={async (placeId, estimatedCost) => {
          await saveEstimatedCost.mutateAsync({ placeId, estimatedCost })
        }}
        onSetDayColor={async (dayId, color) => {
          await setDayColor.mutateAsync({ dayId, color })
        }}
      />
    </div>
  )
}

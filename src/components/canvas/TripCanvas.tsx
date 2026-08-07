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
import { setCoverPhoto, uploadTripPhoto } from '@/lib/photo/upload'
import { savePlace, updatePlaceMemo } from '@/lib/place/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
  TimelineError,
  placeStops,
  removeStop,
  reorderDayItems,
  saveLeg,
  timelineErrorMessage,
  updateStop,
  type LegDraft,
} from '@/lib/timeline/api'
import { nextPosition } from '@/lib/timeline/merge'
import { TripError, tripErrorMessage } from '@/lib/trips/api'
import { fetchTripBundle, tripBundleKey, type DayRow } from '@/lib/trips/bundle'
import { CanvasBoard } from './CanvasBoard'
import type { PlaceDraft } from './PlaceSearchBox'

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

  const bundleQuery = useQuery({
    queryKey: tripBundleKey(tripId),
    queryFn: () => fetchTripBundle(supabase, tripId),
  })

  const refetchBundle = () => queryClient.invalidateQueries({ queryKey: tripBundleKey(tripId) })

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

  const changeCover = useMutation({
    mutationFn: ({ placeId, photoId }: { placeId: string; photoId: string }) =>
      setCoverPhoto(supabase, { placeId, photoId }),
    onSuccess: refetchBundle,
  })

  // E-09 — 메모는 카드에서 바로 고친다 (FR-009)
  const saveMemo = useMutation({
    mutationFn: ({ placeId, memo }: { placeId: string; memo: string }) =>
      updatePlaceMemo(supabase, placeId, memo),
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
      patch: { start_time: string | null; cost_amount: number | null }
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
      <p className="px-5 py-12 text-base text-black/60 sm:px-8 dark:text-white/60">
        여행을 불러오고 있어요.
      </p>
    )
  }

  if (bundleQuery.isError) {
    const error = bundleQuery.error
    const message =
      error instanceof TripError ? tripErrorMessage(error.code) : tripErrorMessage('unknown')

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 px-5 py-12 sm:px-8">
        <h2 className="text-xl font-semibold tracking-tight">여행을 열지 못했어요</h2>
        <p className="text-base text-black/60 dark:text-white/60">{message}</p>
        <Link
          href="/"
          className="flex min-h-11 items-center justify-center rounded-full bg-foreground px-5 text-base font-medium text-background transition-opacity hover:opacity-90"
        >
          여행 목록 보기
        </Link>
      </div>
    )
  }

  const bundle = bundleQuery.data

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-baseline gap-3 px-4 pt-4 pb-3 md:px-5">
        <Link href="/" className="flex min-h-8 items-center text-sm underline underline-offset-4">
          여행 목록
        </Link>
        <h1 className="truncate text-lg font-semibold tracking-tight">{bundle.name}</h1>
        <p className="text-sm text-black/55 dark:text-white/55">
          {bundle.start_date.replaceAll('-', '.')} ~ {bundle.end_date.replaceAll('-', '.')}
        </p>
      </header>

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
            className="flex min-h-8 items-center rounded-full border border-black/15 px-3 text-xs dark:border-white/20"
          >
            여행 다시 불러오기
          </button>
        </p>
      )}

      <CanvasBoard
        bundle={bundle}
        onSave={async (draft) => {
          await save.mutateAsync(draft)
        }}
        onAssignPlace={(placeId, dayId) => guard(() => assignPlace.mutateAsync({ placeId, dayId }))}
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
        onSetCover={async (placeId, photoId) => {
          await changeCover.mutateAsync({ placeId, photoId })
        }}
        onSaveMemo={async (placeId, memo) => {
          await saveMemo.mutateAsync({ placeId, memo })
        }}
      />
    </div>
  )
}

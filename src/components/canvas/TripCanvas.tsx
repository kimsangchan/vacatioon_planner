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
import { savePlace } from '@/lib/place/api'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { TripError, tripErrorMessage } from '@/lib/trips/api'
import { fetchTripBundle, tripBundleKey } from '@/lib/trips/bundle'
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

  const bundleQuery = useQuery({
    queryKey: tripBundleKey(tripId),
    queryFn: () => fetchTripBundle(supabase, tripId),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tripBundleKey(tripId) }),
  })

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

      <CanvasBoard
        bundle={bundle}
        onSave={async (draft) => {
          await save.mutateAsync(draft)
        }}
      />
    </div>
  )
}

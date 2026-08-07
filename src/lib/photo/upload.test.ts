// T6-4a — E-05 사진 업로드 파이프라인 (FR-004).
// 리사이즈는 resize.ts 가 이미 검증했으므로 여기서는 목킹하고, 경로 형식·is_cover·실패 정리만 본다.

import { describe, expect, it, vi } from 'vitest'
import { PhotoResizeError, type PreparedTripPhoto } from './resize'
import {
  PHOTO_BUCKET,
  PhotoError,
  photoErrorMessage,
  photoObjectName,
  photoPaths,
  photoPublicUrl,
  setCoverPhoto,
  uploadTripPhoto,
} from './upload'

// 0001_schema.sql 의 photos CHECK 와 같은 정규식 — 경로가 어긋나면 DB 가 먼저 막는다
const STORAGE_PATH_RE = /^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/
const THUMB_PATH_RE = /^photos\/[0-9a-f-]{36}\/[0-9a-f-]{36}-thumb\.webp$/

const PHOTO_ID = '3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8'

const webp = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/webp' })

const prepared: PreparedTripPhoto = {
  full: { blob: webp(900_000), width: 1600, height: 1200 },
  thumb: { blob: webp(40_000), width: 320, height: 240 },
}

interface FakeOptions {
  existingCount?: number
  uploadError?: (objectName: string) => string | undefined
  insertError?: { message: string; code?: string }
}

function fakeClient(options: FakeOptions = {}) {
  const uploads: { objectName: string; blob: Blob; contentType?: string }[] = []
  const removed: string[][] = []
  const inserted: Record<string, unknown>[] = []
  const updates: { patch: Record<string, unknown>; filters: [string, unknown][] }[] = []

  const client = {
    storage: {
      from(bucket: string) {
        expect(bucket).toBe(PHOTO_BUCKET)
        return {
          async upload(objectName: string, blob: Blob, opts?: { contentType?: string }) {
            const message = options.uploadError?.(objectName)
            if (message) return { data: null, error: { message } }
            uploads.push({ objectName, blob, contentType: opts?.contentType })
            return { data: { path: objectName }, error: null }
          },
          async remove(objectNames: string[]) {
            removed.push(objectNames)
            return { data: [], error: null }
          },
        }
      },
    },
    from(table: string) {
      expect(table).toBe('photos')
      return {
        select(_columns: string, opts?: { count?: string; head?: boolean }) {
          if (opts?.head) {
            return {
              eq: async () => ({ count: options.existingCount ?? 0, error: null }),
            }
          }
          throw new Error('unexpected select')
        },
        insert(row: Record<string, unknown>) {
          inserted.push(row)
          return {
            select: () => ({
              single: async () =>
                options.insertError
                  ? { data: null, error: options.insertError }
                  : { data: row, error: null },
            }),
          }
        },
        update(patch: Record<string, unknown>) {
          const filters: [string, unknown][] = []
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value])
              return builder
            },
            neq(column: string, value: unknown) {
              filters.push([`neq:${column}`, value])
              return builder
            },
            then(resolve: (value: { error: null }) => unknown) {
              updates.push({ patch, filters })
              return Promise.resolve({ error: null }).then(resolve)
            },
          }
          return builder
        },
      }
    },
  }

  return { client, uploads, removed, inserted, updates }
}

const deps = { prepare: async () => prepared, newId: () => PHOTO_ID }

describe('photoPaths·photoPublicUrl — 무작위 경로와 공개 URL (결정 #12)', () => {
  it('본·썸네일 경로가 photos 테이블 CHECK 형식을 만족한다', () => {
    const paths = photoPaths(PHOTO_ID)

    expect(paths.storage_path).toMatch(STORAGE_PATH_RE)
    expect(paths.thumb_path).toMatch(THUMB_PATH_RE)
    expect(paths.storage_path).toBe(`photos/${PHOTO_ID}/${PHOTO_ID}.webp`)
  })

  it('버킷 안 경로는 버킷 이름을 뺀 나머지다', () => {
    expect(photoObjectName(photoPaths(PHOTO_ID).storage_path)).toBe(`${PHOTO_ID}/${PHOTO_ID}.webp`)
  })

  it('공개 URL 은 서명 없이 바로 열린다 (오프라인 캐시·공유 뷰 전제)', () => {
    expect(photoPublicUrl(photoPaths(PHOTO_ID).storage_path, 'http://127.0.0.1:54321')).toBe(
      `http://127.0.0.1:54321/storage/v1/object/public/photos/${PHOTO_ID}/${PHOTO_ID}.webp`,
    )
  })
})

describe('uploadTripPhoto — 담기 (FR-004)', () => {
  it('본과 썸네일을 무작위 경로 두 곳에 올리고 photos 행을 남긴다', async () => {
    const { client, uploads, inserted } = fakeClient()
    const prepare = vi.fn(async () => prepared)

    const photo = await uploadTripPhoto(
      client as never,
      { file: new Blob([new Uint8Array(3_000_000)], { type: 'image/jpeg' }), target: { place_id: 'place-1' } },
      { ...deps, prepare },
    )

    expect(prepare).toHaveBeenCalledTimes(1)
    expect(uploads.map((u) => u.objectName)).toEqual([
      `${PHOTO_ID}/${PHOTO_ID}.webp`,
      `${PHOTO_ID}/${PHOTO_ID}-thumb.webp`,
    ])
    expect(uploads.every((u) => u.contentType === 'image/webp')).toBe(true)
    expect(uploads[0].blob).toBe(prepared.full.blob)
    expect(uploads[1].blob).toBe(prepared.thumb.blob)

    expect(inserted[0]).toMatchObject({
      id: PHOTO_ID,
      place_id: 'place-1',
      leg_id: null,
      storage_path: `photos/${PHOTO_ID}/${PHOTO_ID}.webp`,
      thumb_path: `photos/${PHOTO_ID}/${PHOTO_ID}-thumb.webp`,
    })
    expect(photo.is_cover).toBe(true)
  })

  it('첫 사진만 대표가 된다', async () => {
    const { client, inserted } = fakeClient({ existingCount: 2 })

    const photo = await uploadTripPhoto(
      client as never,
      { file: webp(100), target: { place_id: 'place-1' } },
      deps,
    )

    expect(inserted[0]).toMatchObject({ is_cover: false })
    expect(photo.is_cover).toBe(false)
  })

  it('Leg 첨부도 같은 파이프라인을 쓴다 (FR-018 전제)', async () => {
    const { client, inserted } = fakeClient()

    await uploadTripPhoto(client as never, { file: webp(100), target: { leg_id: 'leg-1' } }, deps)

    expect(inserted[0]).toMatchObject({ place_id: null, leg_id: 'leg-1' })
  })
})

describe('uploadTripPhoto — 거절 (E-05 에러 타입)', () => {
  it('Place 와 Leg 를 함께 지정하면 담기 전에 막는다', async () => {
    const { client, uploads } = fakeClient()

    const failure = await uploadTripPhoto(
      client as never,
      { file: webp(100), target: { place_id: 'place-1', leg_id: 'leg-1' } },
      deps,
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(PhotoError)
    expect((failure as PhotoError).code).toBe('validation/parent-exclusive')
    expect(uploads).toHaveLength(0)
  })

  it('붙일 곳이 없으면 막는다', async () => {
    const { client } = fakeClient()

    await expect(
      uploadTripPhoto(client as never, { file: webp(100), target: {} }, deps),
    ).rejects.toMatchObject({ code: 'validation/parent-exclusive' })
  })

  it('사진이 아닌 파일은 고르는 즉시 막는다', async () => {
    const { client, uploads } = fakeClient()

    await expect(
      uploadTripPhoto(
        client as never,
        { file: new Blob(['x'], { type: 'application/pdf' }), target: { place_id: 'place-1' } },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'storage/bad-mime' })
    expect(uploads).toHaveLength(0)
  })

  it('2MB 아래로 줄이지 못하면 너무 크다고 알린다', async () => {
    const { client } = fakeClient()

    await expect(
      uploadTripPhoto(
        client as never,
        { file: webp(9_000_000), target: { place_id: 'place-1' } },
        {
          ...deps,
          prepare: async () => {
            throw new PhotoResizeError('still too large')
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'storage/too-large' })
  })

  it('버킷이 크기로 거절해도 같은 문구로 모은다', async () => {
    const { client } = fakeClient({
      uploadError: () => 'The object exceeded the maximum allowed size',
    })

    await expect(
      uploadTripPhoto(client as never, { file: webp(100), target: { place_id: 'place-1' } }, deps),
    ).rejects.toMatchObject({ code: 'storage/too-large' })
  })

  it('버킷이 형식으로 거절하면 bad-mime 이다', async () => {
    const { client } = fakeClient({
      uploadError: () => 'mime type text/plain is not supported',
    })

    await expect(
      uploadTripPhoto(client as never, { file: webp(100), target: { place_id: 'place-1' } }, deps),
    ).rejects.toMatchObject({ code: 'storage/bad-mime' })
  })
})

describe('uploadTripPhoto — 실패하면 올린 파일을 치운다', () => {
  it('썸네일 업로드가 실패하면 이미 올린 본을 지운다', async () => {
    const { client, removed } = fakeClient({
      uploadError: (objectName) => (objectName.endsWith('-thumb.webp') ? 'boom' : undefined),
    })

    await expect(
      uploadTripPhoto(client as never, { file: webp(100), target: { place_id: 'place-1' } }, deps),
    ).rejects.toBeInstanceOf(PhotoError)

    expect(removed).toEqual([[`${PHOTO_ID}/${PHOTO_ID}.webp`]])
  })

  it('photos 행 저장이 실패하면 올린 두 파일을 모두 지운다', async () => {
    const { client, removed } = fakeClient({ insertError: { message: 'fk violation', code: '23503' } })

    await expect(
      uploadTripPhoto(client as never, { file: webp(100), target: { place_id: 'place-1' } }, deps),
    ).rejects.toBeInstanceOf(PhotoError)

    expect(removed).toEqual([
      [`${PHOTO_ID}/${PHOTO_ID}.webp`, `${PHOTO_ID}/${PHOTO_ID}-thumb.webp`],
    ])
  })

  it('parent-exclusive CHECK 위반(23514)은 계약 코드로 바꾼다', async () => {
    const { client } = fakeClient({
      insertError: { message: 'photos_check violated', code: '23514' },
    })

    await expect(
      uploadTripPhoto(client as never, { file: webp(100), target: { place_id: 'place-1' } }, deps),
    ).rejects.toMatchObject({ code: 'validation/parent-exclusive' })
  })
})

describe('setCoverPhoto — 대표 사진 바꾸기 (FR-004)', () => {
  it('고른 사진만 대표로 두고 나머지는 내린다', async () => {
    const { client, updates } = fakeClient()

    await setCoverPhoto(client as never, { placeId: 'place-1', photoId: 'photo-2' })

    expect(updates[0]).toMatchObject({ patch: { is_cover: false } })
    expect(updates[0].filters).toContainEqual(['place_id', 'place-1'])
    expect(updates[1]).toMatchObject({ patch: { is_cover: true } })
    expect(updates[1].filters).toContainEqual(['id', 'photo-2'])
  })
})

describe('photoErrorMessage — 다음 행동이 있는 문구 (SPEC §UI 규칙)', () => {
  it('너무 큰 사진은 다시 고르라고 안내한다', () => {
    const message = photoErrorMessage('storage/too-large')

    expect(message).toContain('사진이 너무 커요')
    expect(message).toContain('다시 골라')
  })

  it('나머지 코드에도 문구가 있다', () => {
    expect(photoErrorMessage('storage/bad-mime').length).toBeGreaterThan(0)
    expect(photoErrorMessage('validation/parent-exclusive').length).toBeGreaterThan(0)
    expect(photoErrorMessage('storage/upload-failed').length).toBeGreaterThan(0)
    expect(photoErrorMessage('unknown').length).toBeGreaterThan(0)
  })
})

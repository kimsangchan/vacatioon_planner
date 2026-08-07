// E-05 사진 업로드 (FR-004·FR-018). 원본은 남기지 않는다 — 리사이즈본(≤2MB)과 썸네일만 올린다.
//
// 경로는 무작위 UUID 두 개다(결정 #12). 버킷이 public-read 라 비밀은 경로뿐이고,
// 그래서 경로를 만드는 곳이 여기 하나여야 한다. 형식은 0001_schema.sql 의 photos CHECK 와
// 0004_storage.sql 의 storage 정책이 양쪽에서 강제한다:
//   photos/{uuid}/{uuid}.webp · photos/{uuid}/{uuid}-thumb.webp
//
// 오류 어휘는 lib/place/api.ts·lib/trips/api.ts 와 같은 모양 — UI 가 항상 다음 행동을 붙일 수 있게.

import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseEnv } from '@/lib/supabase/env'
import type { PhotoRow } from '@/lib/trips/bundle'
import { PhotoResizeError, prepareTripPhoto, type PreparedTripPhoto } from './resize'

export const PHOTO_BUCKET = 'photos'
export const PHOTO_MIME = 'image/webp'
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024

export type PhotoErrorCode =
  | 'storage/too-large'
  | 'storage/bad-mime'
  | 'validation/parent-exclusive'
  | 'storage/upload-failed'
  | 'unknown'

export class PhotoError extends Error {
  readonly code: PhotoErrorCode

  constructor(code: PhotoErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'PhotoError'
    this.code = code
  }
}

const MESSAGES: Record<PhotoErrorCode, string> = {
  'storage/too-large': '사진이 너무 커요 — 조금 작은 사진으로 다시 골라 주세요.',
  'storage/bad-mime': '사진 파일만 담을 수 있어요. 이미지 파일로 다시 골라 주세요.',
  'validation/parent-exclusive': '사진은 장소나 이동 중 한 곳에만 담아요. 담을 곳을 하나만 골라 주세요.',
  'storage/upload-failed': '사진을 담지 못했어요. 잠시 뒤에 다시 담아 주세요.',
  unknown: '사진을 담지 못했어요. 잠시 뒤에 다시 담아 주세요.',
}

export function photoErrorMessage(code: PhotoErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.unknown
}

export interface PhotoPaths {
  storage_path: string
  thumb_path: string
}

export function photoPaths(photoId: string): PhotoPaths {
  return {
    storage_path: `${PHOTO_BUCKET}/${photoId}/${photoId}.webp`,
    thumb_path: `${PHOTO_BUCKET}/${photoId}/${photoId}-thumb.webp`,
  }
}

// storage_path 는 버킷 이름을 포함한다 — Storage API 에 넘길 때만 앞을 떼어낸다
export function photoObjectName(storagePath: string): string {
  return storagePath.startsWith(`${PHOTO_BUCKET}/`)
    ? storagePath.slice(PHOTO_BUCKET.length + 1)
    : storagePath
}

// 서명 없는 공개 URL — 만료가 없어야 프리페치·오프라인 캐시·공유 뷰가 성립한다 (결정 #12)
export function photoPublicUrl(storagePath: string, baseUrl?: string): string {
  const base = baseUrl ?? supabaseEnv().url
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${storagePath}`
}

export interface PhotoTarget {
  place_id?: string | null
  leg_id?: string | null
}

export interface UploadTripPhotoInput {
  file: Blob
  /** place_id 또는 leg_id 정확히 하나 (결정 #18) */
  target: PhotoTarget
}

export interface UploadTripPhotoDependencies {
  prepare?: (source: Blob) => Promise<PreparedTripPhoto>
  newId?: () => string
}

interface DataLayerError {
  message: string
  code?: string
}

export function toPhotoError(error: DataLayerError): PhotoError {
  if (error.code === '23514') return new PhotoError('validation/parent-exclusive', error.message)

  const message = error.message.toLowerCase()
  if (message.includes('maximum allowed size') || message.includes('too large')) {
    return new PhotoError('storage/too-large', error.message)
  }
  if (message.includes('mime')) return new PhotoError('storage/bad-mime', error.message)

  return new PhotoError('storage/upload-failed', error.message)
}

export async function uploadTripPhoto(
  client: SupabaseClient,
  input: UploadTripPhotoInput,
  dependencies: UploadTripPhotoDependencies = {},
): Promise<PhotoRow> {
  const prepare = dependencies.prepare ?? ((source: Blob) => prepareTripPhoto(source))
  const newId = dependencies.newId ?? (() => crypto.randomUUID())

  const parent = exclusiveParent(input.target)
  if (!input.file.type.startsWith('image/')) {
    throw new PhotoError('storage/bad-mime')
  }

  const prepared = await prepare(input.file).catch((error: unknown) => {
    if (error instanceof PhotoResizeError) throw new PhotoError('storage/too-large', error.message)
    throw new PhotoError('storage/upload-failed', (error as Error).message)
  })
  if (prepared.full.blob.size > MAX_PHOTO_BYTES) throw new PhotoError('storage/too-large')

  const id = newId()
  const paths = photoPaths(id)
  const objectNames = [photoObjectName(paths.storage_path), photoObjectName(paths.thumb_path)]
  const uploaded: string[] = []

  try {
    for (const [index, blob] of [prepared.full.blob, prepared.thumb.blob].entries()) {
      const { error } = await client.storage
        .from(PHOTO_BUCKET)
        .upload(objectNames[index], blob, { contentType: PHOTO_MIME, upsert: false })
      if (error) throw toPhotoError(error)
      uploaded.push(objectNames[index])
    }

    // 대표는 그 장소·이동의 첫 사진 하나뿐 — 나머지는 사용자가 카드에서 바꾼다
    const isCover = (await countPhotos(client, parent)) === 0

    const { data, error } = await client
      .from('photos')
      .insert({
        id,
        place_id: input.target.place_id ?? null,
        leg_id: input.target.leg_id ?? null,
        ...paths,
        is_cover: isCover,
      })
      .select('id,storage_path,thumb_path,is_cover')
      .single()

    if (error) throw toPhotoError(error)
    return data as PhotoRow
  } catch (error) {
    // 올리다 만 파일을 남기지 않는다 — 정리 자체가 실패해도 원래 오류를 그대로 올린다
    if (uploaded.length > 0) {
      await client.storage
        .from(PHOTO_BUCKET)
        .remove(uploaded)
        .catch(() => undefined)
    }
    throw error instanceof PhotoError ? error : new PhotoError('unknown', (error as Error).message)
  }
}

export interface SetCoverPhotoInput {
  placeId?: string
  legId?: string
  photoId: string
}

export async function setCoverPhoto(
  client: SupabaseClient,
  input: SetCoverPhotoInput,
): Promise<void> {
  const parent = exclusiveParent({ place_id: input.placeId, leg_id: input.legId })

  const { error: clearError } = await client
    .from('photos')
    .update({ is_cover: false })
    .eq(parent.column, parent.id)
  if (clearError) throw toPhotoError(clearError)

  const { error } = await client.from('photos').update({ is_cover: true }).eq('id', input.photoId)
  if (error) throw toPhotoError(error)
}

interface PhotoParent {
  column: 'place_id' | 'leg_id'
  id: string
}

function exclusiveParent(target: PhotoTarget): PhotoParent {
  const placeId = target.place_id ?? undefined
  const legId = target.leg_id ?? undefined
  if ((placeId && legId) || (!placeId && !legId)) throw new PhotoError('validation/parent-exclusive')
  return placeId ? { column: 'place_id', id: placeId } : { column: 'leg_id', id: legId as string }
}

async function countPhotos(client: SupabaseClient, parent: PhotoParent): Promise<number> {
  const { count, error } = await client
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq(parent.column, parent.id)

  if (error) throw toPhotoError(error)
  return count ?? 0
}

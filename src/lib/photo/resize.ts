const DEFAULT_MAX_SIDE = 1600
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_QUALITY_STEPS = [0.86, 0.78, 0.7, 0.62, 0.54]
const WEBP_MIME = 'image/webp'

export interface BitmapLike {
  width: number
  height: number
}

export interface CanvasContextLike {
  drawImage(image: unknown, dx: number, dy: number, dWidth: number, dHeight: number): void
}

export interface CanvasLike {
  width: number
  height: number
  getContext(contextId: '2d'): CanvasContextLike | null
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void
}

export type CanvasFactory = (width: number, height: number) => CanvasLike

export interface PhotoResizeDependencies {
  createBitmap?: (source: Blob) => Promise<BitmapLike>
  canvasFactory?: CanvasFactory
  qualitySteps?: readonly number[]
  maxSide?: number
  maxBytes?: number
}

export interface ResizedPhoto {
  blob: Blob
  width: number
  height: number
}

export const THUMB_MAX_SIDE = 320

export interface PreparedTripPhoto {
  full: ResizedPhoto
  thumb: ResizedPhoto
}

export class PhotoResizeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoResizeError'
  }
}

export async function resizeTripPhoto(
  source: Blob,
  dependencies: PhotoResizeDependencies = {},
): Promise<ResizedPhoto> {
  const maxSide = dependencies.maxSide ?? DEFAULT_MAX_SIDE
  const maxBytes = dependencies.maxBytes ?? DEFAULT_MAX_BYTES
  const qualitySteps = dependencies.qualitySteps ?? DEFAULT_QUALITY_STEPS
  const createBitmap = dependencies.createBitmap ?? defaultCreateBitmap
  const canvasFactory = dependencies.canvasFactory ?? defaultCanvasFactory

  const bitmap = await createBitmap(source)
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide)
  const canvas = canvasFactory(width, height)
  const context = canvas.getContext('2d')
  if (context === null) throw new PhotoResizeError('Cannot create a 2D canvas context.')

  context.drawImage(bitmap, 0, 0, width, height)

  for (const quality of qualitySteps) {
    const blob = await encodeCanvas(canvas, WEBP_MIME, quality)
    if (blob.size <= maxBytes) return { blob, width, height }
  }

  throw new PhotoResizeError(`Resized WebP image is still larger than ${maxBytes} bytes.`)
}

// 업로드 1회에 본(1600px)과 썸네일(320px — 호버 400ms 프리페치 전제, SC-002)을 함께 만든다.
export async function prepareTripPhoto(
  source: Blob,
  dependencies: PhotoResizeDependencies = {},
): Promise<PreparedTripPhoto> {
  const full = await resizeTripPhoto(source, dependencies)
  const thumb = await resizeTripPhoto(source, { ...dependencies, maxSide: THUMB_MAX_SIDE })
  return { full, thumb }
}

function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new PhotoResizeError(`Invalid image dimensions: ${width}x${height}.`)
  }

  const longestSide = Math.max(width, height)
  if (longestSide <= maxSide) return { width, height }

  const scale = maxSide / longestSide
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function encodeCanvas(canvas: CanvasLike, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new PhotoResizeError('Canvas encoding failed.'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

async function defaultCreateBitmap(source: Blob): Promise<BitmapLike> {
  if (typeof createImageBitmap !== 'function') {
    throw new PhotoResizeError('createImageBitmap is not available in this environment.')
  }
  return createImageBitmap(source)
}

function defaultCanvasFactory(width: number, height: number): CanvasLike {
  if (typeof document === 'undefined') {
    throw new PhotoResizeError('document is not available in this environment.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

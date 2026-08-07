import { describe, expect, it, vi } from 'vitest'
import {
  PhotoResizeError,
  prepareTripPhoto,
  resizeTripPhoto,
  type CanvasFactory,
  type CanvasLike,
} from './resize'

const blobOfSize = (size: number, type = 'image/webp') =>
  new Blob([new Uint8Array(size)], { type })

function makeCanvasFactory(sizes: number[]): {
  canvasFactory: CanvasFactory
  canvases: CanvasLike[]
  drawImage: ReturnType<typeof vi.fn>
} {
  const drawImage = vi.fn()
  const canvases: CanvasLike[] = []
  let encodeCount = 0

  const canvasFactory: CanvasFactory = (width, height) => {
    const canvas: CanvasLike = {
      width,
      height,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback, type, quality) => {
        const index = Math.min(encodeCount, sizes.length - 1)
        encodeCount += 1
        callback(blobOfSize(sizes[index], type))
        void quality
      }),
    }
    canvases.push(canvas)
    return canvas
  }

  return { canvasFactory, canvases, drawImage }
}

describe('resizeTripPhoto', () => {
  it('shrinks the longest side to 1600px and emits WebP output', async () => {
    const { canvasFactory, canvases, drawImage } = makeCanvasFactory([900_000])

    const result = await resizeTripPhoto(blobOfSize(3_000_000, 'image/jpeg'), {
      createBitmap: async () => ({ width: 4000, height: 3000 }),
      canvasFactory,
    })

    expect(result.width).toBe(1600)
    expect(result.height).toBe(1200)
    expect(result.blob.type).toBe('image/webp')
    expect(result.blob.size).toBe(900_000)
    expect(canvases[0]).toMatchObject({ width: 1600, height: 1200 })
    expect(drawImage).toHaveBeenCalledWith({ width: 4000, height: 3000 }, 0, 0, 1600, 1200)
  })

  it('keeps images under the limit at their original dimensions', async () => {
    const { canvasFactory } = makeCanvasFactory([200_000])

    const result = await resizeTripPhoto(blobOfSize(400_000, 'image/png'), {
      createBitmap: async () => ({ width: 1200, height: 800 }),
      canvasFactory,
    })

    expect(result.width).toBe(1200)
    expect(result.height).toBe(800)
  })

  it('reduces WebP quality until output is at most 2MB', async () => {
    const { canvasFactory, canvases } = makeCanvasFactory([2_400_000, 1_900_000])

    const result = await resizeTripPhoto(blobOfSize(5_000_000, 'image/jpeg'), {
      createBitmap: async () => ({ width: 3000, height: 3000 }),
      canvasFactory,
    })

    expect(result.blob.size).toBe(1_900_000)
    expect(canvases[0].toBlob).toHaveBeenCalledTimes(2)
    expect(canvases[0].toBlob).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      'image/webp',
      0.86,
    )
    expect(canvases[0].toBlob).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      'image/webp',
      0.78,
    )
  })

  it('throws when WebP encoding cannot fit under 2MB', async () => {
    const { canvasFactory } = makeCanvasFactory([2_100_000, 2_100_000, 2_100_000, 2_100_000, 2_100_000])

    await expect(
      resizeTripPhoto(blobOfSize(5_000_000, 'image/jpeg'), {
        createBitmap: async () => ({ width: 3000, height: 3000 }),
        canvasFactory,
        qualitySteps: [0.86, 0.78, 0.7],
      }),
    ).rejects.toThrow(PhotoResizeError)
  })
})

describe('prepareTripPhoto — 본(1600px) + 썸네일(320px, SC-002 프리페치용)', () => {
  it('produces the 1600px photo and a 320px thumbnail from the same source', async () => {
    const { canvasFactory, canvases } = makeCanvasFactory([900_000, 40_000])

    const result = await prepareTripPhoto(blobOfSize(3_000_000, 'image/jpeg'), {
      createBitmap: async () => ({ width: 4000, height: 3000 }),
      canvasFactory,
    })

    expect(result.full).toMatchObject({ width: 1600, height: 1200 })
    expect(result.thumb).toMatchObject({ width: 320, height: 240 })
    expect(result.full.blob.type).toBe('image/webp')
    expect(result.thumb.blob.type).toBe('image/webp')
    expect(canvases.map((c) => c.width)).toEqual([1600, 320])
  })

  it('does not upscale sources already smaller than the thumbnail limit', async () => {
    const { canvasFactory } = makeCanvasFactory([30_000, 20_000])

    const result = await prepareTripPhoto(blobOfSize(60_000, 'image/png'), {
      createBitmap: async () => ({ width: 250, height: 200 }),
      canvasFactory,
    })

    expect(result.full).toMatchObject({ width: 250, height: 200 })
    expect(result.thumb).toMatchObject({ width: 250, height: 200 })
  })
})

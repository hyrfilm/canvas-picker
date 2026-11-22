// Shared colour-index encoding, decoding, and 1x1 coverage probing.
// Six bits per colour channel give 18-bit indices (1..0x3ffff); the low two
// bits absorb ±1 channel rounding when a shape's own fill and stroke overlap.

export type Shape = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
) => void

export const INDEX_MASK = 0x3ffff
export const SCRAMBLE = 0x9e3779b1

let unscramble = 1
for (let i = 0; i < 5; i++) {
  unscramble = Math.imul(unscramble, 2 - Math.imul(SCRAMBLE, unscramble))
}
export const UNSCRAMBLE = unscramble & INDEX_MASK

function channel(bits: number) {
  return ((bits & 63) << 2) | 2
}

export function encodeColor(index: number) {
  return `rgb(${channel(index >> 12)}, ${channel(index >> 6)}, ${channel(index)})`
}

export function decodePixel(data: Uint8ClampedArray, pixelOffset = 0) {
  const o = pixelOffset * 4
  return data[o + 3] === 255
    ? ((data[o] >> 2) << 12) | ((data[o + 1] >> 2) << 6) | (data[o + 2] >> 2)
    : 0
}

export function decodeNeighborhood(data: Uint8ClampedArray, neighbours: number) {
  const centre = decodePixel(data, 4)
  if (centre === 0) return 0
  let same = 0
  for (let i = 0; i < 9; i++) {
    if (decodePixel(data, i) === centre) same++
  }
  return same > neighbours ? centre : 0
}

export function drawShape(ctx: OffscreenCanvasRenderingContext2D, index: number, shape: Shape) {
  ctx.save()
  ctx.beginPath()
  try {
    ctx.fillStyle = ctx.strokeStyle = encodeColor(index)
    shape(ctx)
  } finally {
    ctx.restore()
  }
}

function measureCoverage(
  probe: OffscreenCanvasRenderingContext2D,
  transform: DOMMatrixReadOnly,
  shape: Shape,
  x: number,
  y: number,
) {
  const fx = Math.floor(x)
  const fy = Math.floor(y)
  probe.save()
  probe.beginPath()
  try {
    probe.resetTransform()
    probe.clearRect(0, 0, 1, 1)
    probe.setTransform(transform.a, transform.b, transform.c, transform.d, transform.e - fx, transform.f - fy)
    shape(probe)
    return probe.getImageData(0, 0, 1, 1).data[3]
  } finally {
    probe.restore()
  }
}

export interface InternalIndexPicker {
  readonly ctx: OffscreenCanvasRenderingContext2D
  clear(): void
  draw(index: number, shape: Shape): void
  pick(x: number, y: number, neighbours?: number): number
  coverage(shape: Shape, x: number, y: number): number
  release(): void
}

export function createInternalIndexPicker(width: number, height: number): InternalIndexPicker {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  let probe: OffscreenCanvasRenderingContext2D | undefined

  function getProbe() {
    return (probe ??= new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!)
  }

  return {
    ctx,
    clear() {
      ctx.save()
      ctx.resetTransform()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    },
    draw(index: number, shape: Shape) {
      drawShape(ctx, index, shape)
    },
    pick(x: number, y: number, neighbours = 2) {
      const fx = Math.floor(x)
      const fy = Math.floor(y)
      if (neighbours <= 0) {
        return decodePixel(ctx.getImageData(fx, fy, 1, 1).data)
      }
      return decodeNeighborhood(ctx.getImageData(fx - 1, fy - 1, 3, 3).data, neighbours)
    },
    coverage(shape: Shape, x: number, y: number) {
      return measureCoverage(getProbe(), ctx.getTransform(), shape, x, y)
    },
    release() {
      canvas.width = 0
      canvas.height = 0
      if (probe) {
        probe.canvas.width = 0
        probe.canvas.height = 0
        probe = undefined
      }
    },
  }
}

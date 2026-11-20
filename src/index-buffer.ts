// A shape supplies its geometry and any stroke/text settings it needs.
// The picker supplies colour and opacity; shapes draw relative to its transform.
export type Shape = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
) => void

export interface IndexPicker {
  readonly ctx: OffscreenCanvasRenderingContext2D
  clear(): void
  draw(index: number, shape: Shape): void
  pick(x: number, y: number, neighbours?: number): number
  coverage(shape: Shape, x: number, y: number): number
}

// Six bits of the index per colour channel. The low two bits are slack: when
// a shape's own fill and stroke overlap, antialiasing can shift a channel by
// one, and pick() has to read the same index back anyway.
function channel(bits: number) {
  return ((bits & 63) << 2) | 2
}

export function createIndexPicker(width: number, height: number): IndexPicker {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const probe = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!

  return {
    // Set the same transform here as on the visible canvas.
    ctx,

    clear() {
      ctx.save()
      ctx.resetTransform()
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.restore()
    },

    // index is an integer, 1..0x3ffff
    draw(index: number, shape: Shape) {
      ctx.save()
      ctx.beginPath()
      try {
        const r = channel(index >> 12)
        const g = channel(index >> 6)
        const b = channel(index)
        ctx.fillStyle = ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`
        shape(ctx)
      } finally {
        ctx.restore()
      }
    },

    // Returns the index drawn at x,y, or 0 for background and antialiased edges.
    // neighbours is how many of the eight surrounding pixels must hold the same
    // index: 0 trusts the pixel alone, 8 needs all of them. Agreement reduces
    // false matches from blended edges; it does not eliminate them.
    pick(x: number, y: number, neighbours = 2) {
      const { data } = ctx.getImageData(Math.floor(x) - 1, Math.floor(y) - 1, 3, 3)
      const index = (i: number) =>
        data[i * 4 + 3] === 255
          ? ((data[i * 4] >> 2) << 12) | ((data[i * 4 + 1] >> 2) << 6) | (data[i * 4 + 2] >> 2)
          : 0

      const centre = index(4)
      let same = 0
      for (let i = 0; i < 9; i++) if (index(i) === centre) same++
      return same > neighbours ? centre : 0
    },

    // How much of the pixel at x,y the shape covers when drawn on its own,
    // from 0 (none) to 255 (all of it).
    coverage(shape: Shape, x: number, y: number) {
      probe.save()
      probe.beginPath()
      try {
        probe.resetTransform()
        probe.clearRect(0, 0, 1, 1)
        probe.setTransform(
          new DOMMatrix().translate(-Math.floor(x), -Math.floor(y)).multiply(ctx.getTransform()),
        )
        shape(probe)
        return probe.getImageData(0, 0, 1, 1).data[3]
      } finally {
        probe.restore()
      }
    },
  }
}

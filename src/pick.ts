// Colour-buffer picking for canvas 2D, in three independent layers:
//   createPicker    - draws shapes in flat colours, reads an index back at x,y
//   createIdPicker  - string ids on top, redraws lazily when something changed
//   trackPointer    - turns pointer events into enter/leave/down/up/click per id

// A shape supplies its geometry and any stroke/text settings it needs.
// The picker supplies colour and opacity; shapes draw relative to its transform.
export type Shape = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
) => void

export type Picker = ReturnType<typeof createPicker>

// Six bits of the index per colour channel. The low two bits are slack: when
// a shape's own fill and stroke overlap, antialiasing can shift a channel by
// one, and pick() has to read the same index back anyway.
function channel(bits: number) {
  return ((bits & 63) << 2) | 2
}

export function createPicker(width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const probe = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!

  return {
    // Set the same transform here as on the visible canvas.
    ctx,

    clear() {
      ctx.save()
      ctx.resetTransform()
      ctx.clearRect(0, 0, width, height)
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

// verify: after reading the pixel, draw that one shape on its own and accept
// it only if it covers at least half of the pixel. This rejects candidates
// whose geometry is elsewhere, while keeping thin shapes.
// neighbours: see Picker.pick. Not needed when verify is on.
export function createIdPicker(
  picker: Picker,
  { verify = true, neighbours = verify ? 0 : 2 }: { verify?: boolean; neighbours?: number } = {},
) {
  const shapes = new Map<string, Shape>()
  const ids = new Map<number, string>()
  let dirty = false

  function redraw() {
    picker.clear()
    ids.clear()
    let n = 1
    for (const [id, shape] of shapes) {
      // Scrambled so that a blend of two colours is unlikely to be a valid one.
      const index = Math.imul(n++, 0x9e3779b1) & 0x3ffff
      ids.set(index, id)
      picker.draw(index, shape)
    }
    dirty = false
  }

  return {
    // Later ids are drawn on top of earlier ones.
    set(id: string, shape: Shape) {
      if (!id.trim()) throw new Error('Pick IDs cannot be empty or whitespace-only.')
      shapes.set(id, shape)
      dirty = true
    },

    delete(id: string) {
      shapes.delete(id)
      dirty = true
    },

    clear() {
      shapes.clear()
      dirty = true
    },

    // Call when a shape's geometry or the picker's transform changed.
    invalidate() {
      dirty = true
    },

    pick(x: number, y: number) {
      if (dirty) redraw()
      const id = ids.get(picker.pick(x, y, neighbours))
      if (id === undefined || !verify) return id
      return picker.coverage(shapes.get(id)!, x, y) >= 128 ? id : undefined
    },
  }
}

export type PointerEventType = 'enter' | 'leave' | 'down' | 'up' | 'click'

// Empty space is a target like any other, with an undefined id. Every event
// carries the id under the pointer or undefined, and moving from a shape onto
// nothing emits leave for the shape, then enter with undefined. The pointer is
// captured on down, so up still arrives when the pointer is released outside
// the element. The returned function removes the listeners.
export function trackPointer(
  el: HTMLElement,
  pick: (x: number, y: number) => string | undefined,
  emit: (type: PointerEventType, id: string | undefined, e: MouseEvent) => void,
) {
  let hovered: string | undefined
  const listeners = new AbortController()
  const options = { signal: listeners.signal }

  function hover(id: string | undefined, e: MouseEvent) {
    if (id === hovered) return
    emit('leave', hovered, e)
    emit('enter', id, e)
    hovered = id
  }

  el.addEventListener('pointermove', (e) => hover(pick(e.offsetX, e.offsetY), e), options)
  el.addEventListener('pointerleave', (e) => hover(undefined, e), options)
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId)
    emit('down', pick(e.offsetX, e.offsetY), e)
  }, options)
  el.addEventListener('pointerup', (e) => emit('up', pick(e.offsetX, e.offsetY), e), options)
  el.addEventListener('click', (e) => emit('click', pick(e.offsetX, e.offsetY), e), options)

  return () => listeners.abort()
}

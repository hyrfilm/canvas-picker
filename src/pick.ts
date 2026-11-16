// Colour-buffer picking for canvas 2D, in three independent layers:
//   createPicker    - draws shapes in flat colours, reads an index back at x,y
//   createIdPicker  - string ids on top, redraws lazily when something changed
//   trackPointer    - turns pointer events into enter/leave/down/up/click per id

// A shape does geometry only (path, fill(), stroke(), lineWidth).
// It must not set fillStyle or strokeStyle.
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
      const r = channel(index >> 12)
      const g = channel(index >> 6)
      const b = channel(index)
      ctx.fillStyle = ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`
      shape(ctx)
    },

    // All nine pixels must be opaque and decode to the same index.
    // This rejects isolated false matches and narrow bands of blended colours.
    pick(x: number, y: number) {
      const { data } = ctx.getImageData(Math.floor(x) - 1, Math.floor(y) - 1, 3, 3)
      const index = (i: number) =>
        data[i * 4 + 3] === 255
          ? ((data[i * 4] >> 2) << 12) | ((data[i * 4 + 1] >> 2) << 6) | (data[i * 4 + 2] >> 2)
          : 0

      const centre = index(4)
      for (let i = 0; i < 9; i++) {
        if (index(i) !== centre) return 0
      }
      return centre
    },
  }
}

export function createIdPicker(picker: Picker) {
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
      return ids.get(picker.pick(x, y))
    },
  }
}

export type PointerEventType = 'enter' | 'leave' | 'down' | 'up' | 'click'

// Empty space is a target like any other, with an undefined id. Every event
// carries the id under the pointer or undefined, and moving from a shape onto
// nothing emits leave for the shape, then enter with undefined. The pointer is
// captured on down, so up still arrives when the pointer is released outside
// the element.
export function trackPointer(
  el: HTMLElement,
  pick: (x: number, y: number) => string | undefined,
  emit: (type: PointerEventType, id: string | undefined, e: MouseEvent) => void,
) {
  let hovered: string | undefined

  function hover(id: string | undefined, e: MouseEvent) {
    if (id === hovered) return
    emit('leave', hovered, e)
    emit('enter', id, e)
    hovered = id
  }

  el.addEventListener('pointermove', (e) => hover(pick(e.offsetX, e.offsetY), e))
  el.addEventListener('pointerleave', (e) => hover(undefined, e))
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId)
    emit('down', pick(e.offsetX, e.offsetY), e)
  })
  el.addEventListener('pointerup', (e) => emit('up', pick(e.offsetX, e.offsetY), e))
  el.addEventListener('click', (e) => emit('click', pick(e.offsetX, e.offsetY), e))
}

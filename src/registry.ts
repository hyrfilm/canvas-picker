import type { IndexPicker, Shape } from './index-buffer.js'

export interface PickingOptions {
  verify?: boolean
  neighbours?: number
}

// verify: after reading the pixel, draw that one shape on its own and accept
// it only if it covers at least half of the pixel. This rejects candidates
// whose geometry is elsewhere, while keeping thin shapes.
// neighbours: see Picker.pick. Not needed when verify is on.
export function createRegistry<T>(
  picker: IndexPicker,
  { verify = true, neighbours = verify ? 0 : 2 }: PickingOptions = {},
) {
  const shapes = new Map<T, Shape>()
  const ids = new Map<number, T>()
  let dirty = false

  let omitted: T | undefined
  function redraw(ignore?: T) {
    if (ignore !== undefined && !shapes.has(ignore)) ignore = undefined
    if (!dirty && (omitted === ignore || Object.is(omitted, ignore))) return
    dirty = true
    picker.clear()
    ids.clear()
    let n = 1
    for (const [id, shape] of shapes) {
      // Scrambled so that a blend of two colours is unlikely to be a valid one.
      const index = Math.imul(n++, 0x9e3779b1) & 0x3ffff
      if (ignore === id || Object.is(ignore, id)) continue
      ids.set(index, id)
      picker.draw(index, shape)
    }
    omitted = ignore
    dirty = false
  }

  return {
    // Later ids are drawn on top of earlier ones.
    set(id: T, shape: Shape) {
      if (id === undefined) throw new TypeError('undefined is reserved for empty space')
      if (shapes.size === 0x3ffff && !shapes.has(id)) throw new RangeError('Pick buffer is full')
      shapes.set(id, shape)
      dirty = true
    },

    delete(id: T) {
      shapes.delete(id)
      dirty = true
    },

    clear() {
      shapes.clear()
      ids.clear()
      omitted = undefined
      dirty = true
    },

    // Call when a shape's geometry or the picker's transform changed.
    invalidate() {
      dirty = true
    },

    drawBuffer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
      redraw()
      ctx.drawImage(picker.ctx.canvas, 0, 0)
    },

    pick(x: number, y: number, ignore?: T) {
      redraw(ignore)
      const id = ids.get(picker.pick(x, y, neighbours))
      if (id === undefined || !verify) return id
      return picker.coverage(shapes.get(id)!, x, y) >= 128 ? id : undefined
    },
  }
}

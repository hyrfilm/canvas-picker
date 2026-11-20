import type { IndexPicker, Shape } from './index-buffer.js'

export const Front = Symbol('Front')
export const Back = Symbol('Back')
export const Forward = Symbol('Forward')
export const Backward = Symbol('Backward')
export type StackPosition = typeof Front | typeof Back | typeof Forward | typeof Backward

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
  let shapes = new Map<T, Shape>()
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

  function sendTo(id: T, position: StackPosition) {
    const shape = shapes.get(id)
    if (!shape) return
    switch (position) {
      case Front:
        shapes.delete(id)
        shapes.set(id, shape)
        break
      case Back: {
        // Updating an existing Map entry keeps its first insertion position.
        const reordered = new Map<T, Shape>([[id, shape]])
        for (const [key, draw] of shapes) reordered.set(key, draw)
        shapes = reordered
        break
      }
      case Forward:
      case Backward: {
        const entries = Array.from(shapes)
        // Map uses SameValueZero, including NaN and signed zero.
        const current = entries.findIndex(([key]) => key === id || Object.is(key, id))
        const next = current + (position === Forward ? 1 : -1)
        if (next < 0 || next >= entries.length) return
        ;[entries[current], entries[next]] = [entries[next], entries[current]]
        shapes = new Map(entries)
        break
      }
      default:
        throw new TypeError('Expected Front, Back, Forward, or Backward')
    }
    dirty = true
  }

  return {
    // Later ids are drawn on top of earlier ones.
    set(id: T, shape: Shape) {
      if (id === undefined) throw new TypeError('undefined is reserved for empty space')
      if (shapes.size === 0x3ffff && !shapes.has(id)) throw new RangeError('Pick buffer is full')
      shapes.set(id, shape)
      dirty = true
    },

    sendTo,
    bringToFront: (id: T) => sendTo(id, Front),
    sendToBack: (id: T) => sendTo(id, Back),
    bringForward: (id: T) => sendTo(id, Forward),
    sendBackward: (id: T) => sendTo(id, Backward),

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

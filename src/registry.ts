import {
  INDEX_MASK,
  SCRAMBLE,
  UNSCRAMBLE,
  createInternalIndexPicker,
  type InternalIndexPicker,
  type Shape,
} from './color-index.js'

export interface PickingOptions {
  verify?: boolean
  neighbours?: number
}

export interface PickOptions<T> {
  ignore?: readonly T[] | ReadonlySet<T>
}

// verify: after reading the pixel, draw that one shape on its own and accept
// it only if it covers at least half of the pixel. This rejects candidates
// whose geometry is elsewhere, while keeping thin shapes.
// neighbours: see IndexPicker.pick. Not needed when verify is on.
export function createRegistry<T>(
  initialWidth: number,
  initialHeight: number,
  { verify = true, neighbours = verify ? 0 : 2 }: PickingOptions = {},
) {
  let width = initialWidth
  let height = initialHeight
  let transform = new DOMMatrix()

  const shapes = new Map<T, Shape>()
  let ordered: ([T, Shape] | undefined)[] = []
  let buffer: InternalIndexPicker | undefined
  let dirty = true
  let omitted: Set<T> | undefined
  let version = 0

  function invalidate() {
    dirty = true
    ordered = []
    version++
  }

  function resolveIgnored(ignore?: readonly T[] | ReadonlySet<T>): Set<T> | undefined {
    if (ignore === undefined) return undefined
    if (!Array.isArray(ignore) && !(ignore instanceof Set)) {
      throw new TypeError('Expected ignore to be an array or Set of targets')
    }
    let set: Set<T> | undefined
    for (const target of ignore) {
      if (shapes.has(target)) (set ??= new Set()).add(target)
    }
    return set
  }

  function sameIgnored(a: Set<T> | undefined, b: Set<T> | undefined) {
    if (a === b) return true
    if (!a || !b || a.size !== b.size) return false
    for (const target of a) if (!b.has(target)) return false
    return true
  }

  function redraw(ignore?: readonly T[] | ReadonlySet<T>) {
    const excluded = resolveIgnored(ignore)
    if (!dirty && buffer && sameIgnored(omitted, excluded)) return buffer
    dirty = true
    if (!buffer) {
      buffer = createInternalIndexPicker(width, height)
      buffer.ctx.setTransform(transform)
    }
    buffer.clear()
    ordered = []
    let n = 1
    for (const entry of shapes) {
      const index = Math.imul(n++, SCRAMBLE) & INDEX_MASK
      if (excluded?.has(entry[0])) {
        ordered.push(undefined)
        continue
      }
      ordered.push(entry)
      buffer.draw(index, entry[1])
    }
    omitted = excluded
    dirty = false
    return buffer
  }

  return {
    get width() { return width },
    get height() { return height },
    get version() { return version },

    // Later ids are drawn on top of earlier ones.
    set(id: T, shape: Shape) {
      if (id === undefined) throw new TypeError('undefined is reserved for empty space')
      if (shapes.size === INDEX_MASK && !shapes.has(id)) throw new RangeError('Pick buffer is full')
      shapes.set(id, shape)
      invalidate()
    },

    delete(id: T) {
      shapes.delete(id)
      invalidate()
    },

    clear() {
      shapes.clear()
      omitted = undefined
      invalidate()
    },

    // Call when a shape's geometry or the picker's transform changed.
    invalidate,

    resize(nextWidth: number, nextHeight: number) {
      width = nextWidth
      height = nextHeight
      if (buffer) {
        buffer.ctx.canvas.width = width
        buffer.ctx.canvas.height = height
        buffer.ctx.setTransform(transform)
      }
      invalidate()
    },

    setTransform(next: DOMMatrix) {
      transform = next
      if (buffer) buffer.ctx.setTransform(transform)
      invalidate()
    },

    drawBuffer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) {
      const target = redraw()
      ctx.drawImage(target.ctx.canvas, 0, 0)
    },

    pick(x: number, y: number, ignore?: readonly T[] | ReadonlySet<T>) {
      if (shapes.size === 0) return undefined
      const target = redraw(ignore)
      const hitIndex = target.pick(x, y, neighbours)
      if (hitIndex === 0) return undefined
      const slot = Math.imul(hitIndex, UNSCRAMBLE) & INDEX_MASK
      const entry = ordered[slot - 1]
      if (!entry) return undefined
      if (!verify) return entry[0]
      return target.coverage(entry[1], x, y) >= 128 ? entry[0] : undefined
    },

    // Release offscreen canvas backing stores on disposal.
    release() {
      shapes.clear()
      omitted = undefined
      invalidate()
      if (buffer) {
        buffer.release()
        buffer = undefined
      }
    },
  }
}

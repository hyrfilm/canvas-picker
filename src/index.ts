import { createIndexPicker, type Shape } from './index-buffer.js'
import { createRegistry, type PickingOptions } from './registry.js'
import { canvasPoint, listen, type EventType, type Handler, type PickerEvent, type Point } from './interaction.js'

export { filled, stroked } from './shapes.js'
export type { Shape, PickingOptions, EventType, Handler, PickerEvent, Point }

type Key = {} | null
interface Size { width: number; height: number }

export interface Picker<T> {
  set(target: T, shape: Shape): void
  delete(target: T): void
  clear(): void
  invalidate(): void
  pick(x: number, y: number): T | undefined
  resize(width: number, height: number): void
  setTransform(matrix: DOMMatrix2DInit): void
  drawBuffer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void
}

export interface CanvasPicker<T> extends Picker<T> {
  track(handler: Handler<T>): () => void
  on<K extends EventType>(type: K, handler: Handler<T, K>): () => void
  on<K extends EventType>(target: T, type: K, handler: (event: PickerEvent<T, K> & { target: T }) => void): () => void
}

export interface CanvasOptions extends Partial<Size>, PickingOptions {
  dragThreshold?: number
  mapPoint?: (event: PointerEvent) => Point
}

function checkSize(width: number, height: number) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) throw new RangeError('Picker dimensions must be positive integers')
}

export function createPicker<T extends Key = string>(canvas: HTMLCanvasElement, options?: CanvasOptions): CanvasPicker<T>
export function createPicker<T extends Key = string>(size: Size & PickingOptions): Picker<T>
export function createPicker<T extends Key = string>(source: HTMLCanvasElement | (Size & PickingOptions), options: CanvasOptions = {}): Picker<T> {
  const width = options.width ?? source.width
  const height = options.height ?? source.height
  checkSize(width, height)
  const buffer = createIndexPicker(width, height)
  const ctx = buffer.ctx
  const canvas = 'getBoundingClientRect' in source ? source : undefined
  const registry = createRegistry<T>(buffer, 'getBoundingClientRect' in source ? options : source)
  let matrix = new DOMMatrix()
  let inverse = matrix.inverse()

  const picker: Picker<T> = {
    ...registry,
    pick(x, y) {
      const pixel = matrix.transformPoint({ x, y })
      if (!(pixel.x >= 0 && pixel.y >= 0 && pixel.x < ctx.canvas.width && pixel.y < ctx.canvas.height)) return undefined
      return registry.pick(pixel.x, pixel.y)
    },
    resize(w, h) {
      checkSize(w, h)
      ctx.canvas.width = w
      ctx.canvas.height = h
      ctx.setTransform(matrix)
      registry.invalidate()
    },
    setTransform(transform) {
      const next = DOMMatrix.fromMatrix(transform)
      const inv = next.inverse()
      if (!next.is2D || ![inv.a, inv.b, inv.c, inv.d, inv.e, inv.f].every(Number.isFinite)) throw new RangeError('Expected an invertible 2D transform')
      ctx.setTransform(next)
      matrix = next
      inverse = inv
      registry.invalidate()
    },
  }
  if (!canvas) return picker

  const threshold = options.dragThreshold ?? 5
  if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError('Invalid drag threshold')
  function point(event: PointerEvent): Point {
    const { x, y } = options.mapPoint ? options.mapPoint(event)
      : inverse.transformPoint(canvasPoint(canvas!, event, ctx.canvas.width, ctx.canvas.height))
    return { x, y }
  }
  const handlers = new Set<Handler<T>>()
  const targeted = new Map<T, Set<Handler<T>>>()
  let stop: (() => void) | undefined

  function prune() {
    if (!handlers.size && !targeted.size) {
      stop?.()
      stop = undefined
    }
  }
  function subscribe(group: Set<Handler<T>>, handler: Handler<T>, target?: T) {
    const entry: Handler<T> = event => handler(event)
    group.add(entry)
    stop ??= listen(canvas!, point, picker.pick, event => {
      // Snapshot both groups before callbacks can register further listeners.
      const local = event.target === undefined ? undefined : targeted.get(event.target)
      const entries = [...handlers, ...(local ?? [])]
      for (const fn of entries) if (handlers.has(fn) || local?.has(fn)) fn(event)
    }, threshold)
    return () => {
      group.delete(entry)
      if (!group.size && target !== undefined && targeted.get(target) === group) targeted.delete(target)
      prune()
    }
  }
  const interactive: CanvasPicker<T> = {
    ...picker,
    delete(target) {
      picker.delete(target)
      targeted.get(target)?.clear()
      targeted.delete(target)
      prune()
    },
    clear() {
      picker.clear()
      for (const group of targeted.values()) group.clear()
      targeted.clear()
      prune()
    },
    track: handler => subscribe(handlers, handler),
    on<K extends EventType>(...args: [K, Handler<T, K>] | [T, K, (event: PickerEvent<T, K> & { target: T }) => void]) {
      if (args.length === 2) {
        const [type, handler] = args
        return subscribe(handlers, event => { if (event.type === type) handler(event as PickerEvent<T, K>) })
      }
      const [target, type, handler] = args
      const group = targeted.get(target) ?? new Set<Handler<T>>()
      targeted.set(target, group)
      return subscribe(group, event => { if (event.type === type) handler(event as PickerEvent<T, K> & { target: T }) }, target)
    },
  }
  return interactive
}

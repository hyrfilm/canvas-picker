import type { Shape } from './color-index.js'
import { canvasPoint, type ClientPoint, type Point, type Size } from './coordinates.js'
import { createPointerTracker, type EventType, type Handler, type PickerEvent } from './pointer.js'
import { createRegistry, type PickingOptions, type PickOptions } from './registry.js'

export { filled, stroked } from './shapes.js'
export { canvasPoint }
export type { Shape, PickingOptions, PickOptions, EventType, Handler, PickerEvent, Point, ClientPoint, Size }

type Key = {} | null

export interface Picker<T> {
  set(target: T, shape: Shape): void
  delete(target: T): void
  clear(): void
  invalidate(): void
  pick(x: number, y: number, options?: PickOptions<T>): T | undefined
  resize(width: number, height: number): void
  setTransform(matrix: DOMMatrix2DInit): void
  drawBuffer(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): void
}

export interface CanvasPicker<T> extends Picker<T> {
  dispose(): void
  track(handler: Handler<T>): () => void
  on<K extends EventType>(type: K, handler: Handler<T, K>): () => void
  on<S extends T | undefined, K extends EventType>(target: S, type: K, handler: (event: PickerEvent<T, K> & { target: S }) => void): () => void
}

export interface CanvasOptions<T = string> extends Partial<Size>, PickingOptions {
  canDrag?: (target: T, event: PointerEvent) => boolean
  dragThreshold?: number
  mapPoint?: (event: PointerEvent) => Point
}

function dimension(value: number) {
  if (!(value > 0 && value <= 0xffffffff)) throw new RangeError('Expected a positive canvas dimension')
  return Math.max(1, Math.round(value))
}

export function createPicker<T extends Key = string>(canvas: HTMLCanvasElement, options?: CanvasOptions<T>): CanvasPicker<T>
export function createPicker<T extends Key = string>(size: Size & PickingOptions): Picker<T>
export function createPicker<T extends Key = string>(source: HTMLCanvasElement | (Size & PickingOptions), options: CanvasOptions<T> = {}): Picker<T> {
  const isCanvas = 'getBoundingClientRect' in source
  const canvas = isCanvas ? source : undefined
  const width = dimension(options.width ?? source.width)
  const height = dimension(options.height ?? source.height)
  const registry = createRegistry<T>(width, height, isCanvas ? options : source)
  let matrix = new DOMMatrix()
  let inverse = matrix.inverse()

  const picker: Picker<T> = {
    set: registry.set,
    delete: registry.delete,
    clear: registry.clear,
    invalidate: registry.invalidate,
    drawBuffer: registry.drawBuffer,
    pick(x, y, opts) {
      const pixel = matrix.transformPoint({ x, y })
      if (!(pixel.x >= 0 && pixel.y >= 0 && pixel.x < registry.width && pixel.y < registry.height)) return undefined
      return registry.pick(pixel.x, pixel.y, opts?.ignore)
    },
    resize(w, h) {
      registry.resize(dimension(w), dimension(h))
    },
    setTransform(transform) {
      const next = DOMMatrix.fromMatrix(transform)
      const inv = next.inverse()
      if (!next.is2D || ![inv.a, inv.b, inv.c, inv.d, inv.e, inv.f].every(Number.isFinite)) {
        throw new RangeError('Expected an invertible 2D transform')
      }
      matrix = next
      inverse = inv
      registry.setTransform(next)
    },
  }
  if (!canvas) return picker

  const threshold = options.dragThreshold ?? 5
  if (!Number.isFinite(threshold) || threshold < 0) throw new RangeError('Invalid drag threshold')

  function point(event: MouseEvent): Point {
    const mapped = options.mapPoint
      ? options.mapPoint(event as PointerEvent)
      : inverse.transformPoint(canvasPoint(canvas!, event, registry.width, registry.height))
    return { x: mapped.x, y: mapped.y }
  }

  const handlers = new Set<Handler<T>>()
  let targeted = new Map<T | undefined, Set<Handler<T>>>()
  const tracker = createPointerTracker(
    canvas,
    point,
    picker.pick,
    () => registry.version,
    dispatch,
    threshold,
    options.canDrag,
  )
  let disposed = false

  function dispatch(event: PickerEvent<T>, local = targeted.get(event.target)) {
    // Snapshot both groups before callbacks can register further listeners.
    const entries = [...handlers, ...(local ?? [])]
    for (const fn of entries) {
      if (handlers.has(fn) || local?.has(fn)) fn(event)
    }
  }

  function prune() {
    if (!handlers.size && !targeted.size) tracker.stop()
  }

  function subscribe(group: Set<Handler<T>>, handler: Handler<T>, target?: T) {
    if (disposed) throw new Error('Picker has been disposed')
    const entry: Handler<T> = event => handler(event)
    group.add(entry)
    tracker.start()
    return () => {
      group.delete(entry)
      if (!group.size && targeted.get(target) === group) targeted.delete(target)
      prune()
    }
  }

  const interactive: CanvasPicker<T> = {
    ...picker,
    dispose() {
      if (disposed) return
      disposed = true
      try {
        tracker.stop()
      } finally {
        handlers.clear()
        for (const group of targeted.values()) group.clear()
        targeted.clear()
        registry.release()
      }
    },
    delete(target) {
      picker.delete(target)
      const removed = targeted.get(target)
      targeted.delete(target)
      try {
        tracker.cancelTarget(target, e => dispatch(e, removed))
      } finally {
        removed?.clear()
        prune()
      }
    },
    clear() {
      picker.clear()
      // Detach old groups first: a dragcancel handler can register a replacement.
      const removed = targeted
      targeted = new Map()
      const background = removed.get(undefined)
      if (background) {
        targeted.set(undefined, background)
        removed.delete(undefined)
      }
      try {
        tracker.cancelTarget(undefined, e => dispatch(e, removed.get(e.target)))
      } finally {
        for (const group of removed.values()) group.clear()
        prune()
      }
    },
    track: handler => subscribe(handlers, handler),
    on<S extends T | undefined, K extends EventType>(
      ...args: [K, Handler<T, K>] | [S, K, (event: PickerEvent<T, K> & { target: S }) => void]
    ) {
      if (args.length === 2) {
        const [type, handler] = args
        return subscribe(handlers, event => {
          if (event.type === type) handler(event as PickerEvent<T, K>)
        })
      }
      const [target, type, handler] = args
      const group = targeted.get(target) ?? new Set<Handler<T>>()
      const off = subscribe(group, event => {
        if (event.type === type) handler(event as PickerEvent<T, K> & { target: S })
      }, target)
      targeted.set(target, group)
      return off
    },
  }
  return interactive
}

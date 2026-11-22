import type { Point } from './coordinates.js'
import { createGestureMachine, type DragEventType } from './gesture.js'
import { createHoverMachine } from './hover.js'

type PointerEventType = 'enter' | 'leave' | 'move' | 'down' | 'up' | 'click'
export type EventType = PointerEventType | DragEventType

export type PickerEvent<T, K extends EventType = EventType> = {
  [P in K]: Point & { type: P; event: PointerEvent } & (
    P extends DragEventType
      ? { target: T; startX: number; startY: number; dx: number; dy: number }
      : { target: T | undefined }
  )
}[K]

export type Handler<T, K extends EventType = EventType> = (event: PickerEvent<T, K>) => void

export function createPointerTracker<T>(
  canvas: HTMLCanvasElement,
  point: (event: MouseEvent) => Point,
  pick: (x: number, y: number) => T | undefined,
  getVersion: () => number,
  emit: Handler<T>,
  threshold: number,
  canDrag?: (target: T, event: PointerEvent) => boolean,
) {
  let controller: AbortController | undefined

  const hover = createHoverMachine<T>((type, target, event, p) => {
    emit({ type, target, x: p.x, y: p.y, event } as PickerEvent<T>)
  })

  const gesture = createGestureMachine<T>(
    canvas,
    threshold,
    canDrag,
    dragEvent => emit(dragEvent as PickerEvent<T>),
    (target, event, p) => emit({ type: 'down', target, x: p.x, y: p.y, event }),
  )

  function start() {
    if (controller) return
    const session = new AbortController()
    controller = session
    const options = { signal: session.signal }

    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || gesture.isActive()) return
      const p = point(event)
      gesture.down(event, p, pick(p.x, p.y))
    }, options)

    canvas.addEventListener('pointermove', event => {
      if (!event.isPrimary || gesture.isBusyFor(event.pointerId)) return
      const p = point(event)
      const outcome = gesture.move(event, p)
      if (session.signal.aborted) return
      if (outcome === 'released') {
        emit({ type: 'up', target: pick(p.x, p.y), x: p.x, y: p.y, event })
        if (session.signal.aborted) return
      }
      const initial = pick(p.x, p.y)
      const version = getVersion()
      const target = hover.move(initial, event, p, () => (getVersion() !== version ? pick(p.x, p.y) : initial))
      if (session.signal.aborted) return
      emit({ type: 'move', target, x: p.x, y: p.y, event })
    }, options)

    canvas.addEventListener('pointerleave', event => {
      if (event.isPrimary) hover.leave(event, point(event))
    }, options)

    canvas.addEventListener('pointerup', event => {
      if (!event.isPrimary) return
      if (event.button !== 0 && !gesture.ownsPointer(event.pointerId)) return
      const p = point(event)
      gesture.end(event, p)
      if (session.signal.aborted) return
      emit({ type: 'up', target: pick(p.x, p.y), x: p.x, y: p.y, event })
    }, options)

    canvas.addEventListener('click', event => {
      if (gesture.consumeSuppressedClick(event)) return
      const p = point(event)
      emit({ type: 'click', target: pick(p.x, p.y), x: p.x, y: p.y, event: event as PointerEvent })
    }, options)

    for (const type of ['pointercancel', 'lostpointercapture'] as const) {
      canvas.addEventListener(type, event => gesture.cancel(event), options)
    }

    canvas.ownerDocument.defaultView?.addEventListener('blur', () => gesture.cancel(), options)
  }

  function stop() {
    if (controller) {
      controller.abort()
      controller = undefined
    }
    hover.reset()
    gesture.cancel()
  }

  function cancelTarget(target: T | undefined, notify: Handler<T>) {
    hover.invalidate(target)
    gesture.cancelTarget(target, dragEvent => notify(dragEvent as PickerEvent<T>))
  }

  return { start, stop, cancelTarget }
}

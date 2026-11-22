import type { Point } from './coordinates.js'
import { sameKey } from './hover.js'

export type DragEventType = 'dragstart' | 'drag' | 'dragend' | 'dragcancel'

export interface DragPayload<T, K extends DragEventType = DragEventType> {
  type: K
  target: T
  x: number
  y: number
  startX: number
  startY: number
  dx: number
  dy: number
  event: PointerEvent
}

export type DragEmitter<T> = (event: DragPayload<T>) => void

type GestureState<T> =
  | { phase: 'idle' }
  | {
      phase: 'pressed'
      target: T | undefined
      pointerId: number
      downClientX: number
      downClientY: number
      start: Point
      last: Point
      lastEvent: PointerEvent
      draggable: boolean
      releaseCapture: () => void
    }
  | {
      phase: 'dragging'
      target: T
      pointerId: number
      start: Point
      last: Point
      lastEvent: PointerEvent
      releaseCapture: () => void
    }

const noop = () => {}

// Explicit pointer-capture owner: releases capture at most once.
function acquireCapture(canvas: HTMLCanvasElement, pointerId: number): () => void {
  let held = false
  try {
    canvas.setPointerCapture(pointerId)
    held = true
  } catch {
    // Synthetic PointerEvents or detached canvases cannot capture.
  }
  return () => {
    if (!held) return
    held = false
    try {
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    } catch {
      // Ignore if canvas detached or pointer already ended.
    }
  }
}

function dragPayload<T>(
  type: DragEventType,
  target: T,
  start: Point,
  point: Point,
  event: PointerEvent,
): DragPayload<T> {
  return {
    type,
    target,
    x: point.x,
    y: point.y,
    startX: start.x,
    startY: start.y,
    dx: point.x - start.x,
    dy: point.y - start.y,
    event,
  }
}

export function createGestureMachine<T>(
  canvas: HTMLCanvasElement,
  threshold: number,
  canDrag: ((target: T, event: PointerEvent) => boolean) | undefined,
  emitDrag: DragEmitter<T>,
  emitDown: (target: T | undefined, event: PointerEvent, point: Point) => void,
) {
  let state: GestureState<T> = { phase: 'idle' }
  let suppressedPointerId: number | undefined
  let epoch = 0

  function cancel(event?: PointerEvent, notify: DragEmitter<T> = emitDrag) {
    if (state.phase === 'idle') return
    if (event !== undefined && state.pointerId !== event.pointerId) return
    const previous = state
    state = { phase: 'idle' }
    ++epoch
    previous.releaseCapture()
    suppressedPointerId = previous.pointerId
    if (previous.phase === 'dragging') {
      notify(dragPayload('dragcancel', previous.target, previous.start, previous.last, event ?? previous.lastEvent))
    }
  }

  return {
    isActive() {
      return state.phase !== 'idle'
    },

    ownsPointer(pointerId: number) {
      return state.phase !== 'idle' && state.pointerId === pointerId
    },

    isBusyFor(pointerId: number) {
      return state.phase !== 'idle' && state.pointerId !== pointerId
    },

    down(event: PointerEvent, point: Point, target: T | undefined) {
      if (state.phase !== 'idle') return
      suppressedPointerId = undefined
      const token = ++epoch
      state = {
        phase: 'pressed',
        target,
        pointerId: event.pointerId,
        downClientX: event.clientX,
        downClientY: event.clientY,
        start: point,
        last: point,
        lastEvent: event,
        draggable: false,
        releaseCapture: noop,
      }
      const draggable = target !== undefined && (canDrag?.(target, event) ?? true)
      if (epoch !== token || state.phase !== 'pressed') return
      state.draggable = draggable
      state.releaseCapture = acquireCapture(canvas, event.pointerId)
      emitDown(target, event, point)
    },

    move(event: PointerEvent, point: Point): 'idle' | 'active' | 'released' {
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return 'idle'
      // Chorded release: another button is still held so primary release arrives as pointermove.
      if (!(event.buttons & 1)) {
        this.end(event, point)
        return 'released'
      }
      state.last = point
      state.lastEvent = event
      if (state.phase === 'pressed') {
        if (
          state.draggable &&
          state.target !== undefined &&
          Math.hypot(event.clientX - state.downClientX, event.clientY - state.downClientY) >= threshold
        ) {
          const token = ++epoch
          const dragging: GestureState<T> = {
            phase: 'dragging',
            target: state.target,
            pointerId: state.pointerId,
            start: state.start,
            last: point,
            lastEvent: event,
            releaseCapture: state.releaseCapture,
          }
          state = dragging
          emitDrag(dragPayload('dragstart', dragging.target, dragging.start, point, event))
          if (epoch !== token) return 'active'
          emitDrag(dragPayload('drag', dragging.target, dragging.start, point, event))
        }
        return 'active'
      }
      emitDrag(dragPayload('drag', state.target, state.start, point, event))
      return 'active'
    },

    end(event: PointerEvent, point: Point) {
      if (state.phase === 'idle' || state.pointerId !== event.pointerId) return false
      const previous = state
      state = { phase: 'idle' }
      ++epoch
      previous.releaseCapture()
      if (previous.phase === 'dragging') {
        suppressedPointerId = previous.pointerId
        emitDrag(dragPayload('dragend', previous.target, previous.start, point, event))
      }
      return true
    },

    cancel,

    cancelTarget(target: T | undefined, notify: DragEmitter<T>) {
      if (state.phase === 'idle' || state.target === undefined) return
      if (target !== undefined && !sameKey(target, state.target)) return
      cancel(undefined, notify)
    },

    // Suppress the browser click that follows a completed or cancelled drag.
    // Keyboard-activated clicks have detail === 0 and are never suppressed.
    consumeSuppressedClick(event: MouseEvent) {
      if (!event.detail || suppressedPointerId === undefined) return false
      const matches = 'pointerId' in event && typeof event.pointerId === 'number'
        ? event.pointerId === suppressedPointerId
        : true
      if (matches) {
        suppressedPointerId = undefined
        return true
      }
      return false
    },
  }
}

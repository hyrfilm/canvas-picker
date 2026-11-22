import type { Point } from './coordinates.js'

export function sameKey<T>(a: T, b: T) {
  return a === b || Object.is(a, b)
}

type HoverState<T> = { active: false } | { active: true; target: T | undefined }

export type HoverEmitter<T> = (
  type: 'enter' | 'leave',
  target: T | undefined,
  event: PointerEvent,
  point: Point,
) => void

// Small explicit state machine for enter/leave transitions.
// Repeated moves on the same target do nothing; moving A -> B emits leave(A)
// then enter(B) once each, guarding against re-entrant reset or scene edits during leave.
export function createHoverMachine<T>(emit: HoverEmitter<T>) {
  let state: HoverState<T> = { active: false }
  let epoch = 0

  return {
    move(
      target: T | undefined,
      event: PointerEvent,
      point: Point,
      recheck?: () => T | undefined,
    ): T | undefined {
      if (state.active && sameKey(state.target, target)) return target
      const token = ++epoch
      const previous = state
      state = { active: false }
      if (previous.active) {
        emit('leave', previous.target, event, point)
        if (epoch !== token) return undefined
        if (recheck) target = recheck()
      }
      state = { active: true, target }
      emit('enter', target, event, point)
      return target
    },

    leave(event: PointerEvent, point: Point) {
      if (!state.active) return
      ++epoch
      const previous = state.target
      state = { active: false }
      emit('leave', previous, event, point)
    },

    // Clear stale hover when a target is deleted or all targets are cleared.
    invalidate(target?: T) {
      if (!state.active) return
      if (target === undefined ? state.target === undefined : !sameKey(state.target, target)) return
      ++epoch
      state = { active: false }
    },

    reset() {
      ++epoch
      state = { active: false }
    },
  }
}

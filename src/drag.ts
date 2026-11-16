// Optional pointer dragging. The app decides how an object moves or is dropped.
type Drag = {
  id: string
  startX: number
  startY: number
  x: number
  y: number
  dx: number
  dy: number
}

function trackDrag(
  el: HTMLElement,
  pick: (x: number, y: number) => string | undefined,
  emit: (type: 'start' | 'move' | 'end' | 'cancel', drag: Drag, event: PointerEvent) => void,
) {
  type Gesture = {
    id: string
    pointerId: number
    start: PointerEvent
    last: PointerEvent
    started: boolean
  }
  let gesture: Gesture | undefined
  const listeners = new AbortController()
  const options = { signal: listeners.signal }

  function position(active: Gesture, event: PointerEvent): Drag {
    return {
      id: active.id,
      startX: active.start.offsetX,
      startY: active.start.offsetY,
      x: event.offsetX,
      y: event.offsetY,
      dx: event.offsetX - active.start.offsetX,
      dy: event.offsetY - active.start.offsetY,
    }
  }

  function finish(type: 'end' | 'cancel', event: PointerEvent) {
    const active = gesture
    if (!active || active.pointerId !== event.pointerId) return
    gesture = undefined
    if (el.hasPointerCapture(active.pointerId)) el.releasePointerCapture(active.pointerId)
    if (active.started) emit(type, position(active, type === 'end' ? event : active.last), event)
  }

  el.addEventListener('pointerdown', event => {
    if (gesture || event.button !== 0 || !event.isPrimary) return
    const id = pick(event.offsetX, event.offsetY)
    if (id === undefined) return
    gesture = { id, pointerId: event.pointerId, start: event, last: event, started: false }
    el.setPointerCapture(event.pointerId)
  }, options)

  el.addEventListener('pointermove', event => {
    const active = gesture
    if (!active || active.pointerId !== event.pointerId) return
    active.last = event
    if (!active.started) {
      // Keep a small amount of hand movement from turning a click into a drag.
      if (Math.hypot(event.clientX - active.start.clientX, event.clientY - active.start.clientY) < 3) return
      active.started = true
      emit('start', position(active, event), event)
    }
    // Starting a drag can synchronously cancel it or dispose the helper.
    if (gesture === active) emit('move', position(active, event), event)
  }, options)

  el.addEventListener('pointerup', event => finish('end', event), options)
  el.addEventListener('pointercancel', event => finish('cancel', event), options)
  el.addEventListener('lostpointercapture', event => finish('cancel', event), options)
  window.addEventListener('blur', () => { if (gesture) finish('cancel', gesture.last) }, options)

  return () => {
    listeners.abort()
    if (gesture) finish('cancel', gesture.last)
  }
}

export { trackDrag }

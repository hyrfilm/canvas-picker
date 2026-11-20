export interface Point { x: number; y: number }
type PointerType = 'enter' | 'leave' | 'move' | 'down' | 'up' | 'click'
type DragType = 'dragstart' | 'drag' | 'dragend' | 'dragcancel'
export type EventType = PointerType | DragType

export type PickerEvent<T, K extends EventType = EventType> = {
  [P in K]: Point & { type: P; event: PointerEvent } & (
    P extends DragType ? { target: T; startX: number; startY: number; dx: number; dy: number }
    : { target: T | undefined }
  )
}[K]

export type Handler<T, K extends EventType = EventType> = (event: PickerEvent<T, K>) => void

// Use the displayed content box, including positive axis-aligned CSS scaling.
export function canvasPoint(canvas: HTMLCanvasElement, event: PointerEvent, width: number, height: number): Point {
  const rect = canvas.getBoundingClientRect()
  const css = getComputedStyle(canvas)
  function axis(client: number, edge: number, displayed: number, size: string, before: number, after: number, units: number) {
    const content = parseFloat(size) - (css.boxSizing === 'border-box' ? before + after : 0)
    const local = (client - edge) * (content + before + after) / displayed
    return (local - before) * units / content
  }
  const left = parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft)
  const right = parseFloat(css.borderRightWidth) + parseFloat(css.paddingRight)
  const top = parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop)
  const bottom = parseFloat(css.borderBottomWidth) + parseFloat(css.paddingBottom)
  return {
    x: axis(event.clientX, rect.left, rect.width, css.width, left, right, width),
    y: axis(event.clientY, rect.top, rect.height, css.height, top, bottom, height),
  }
}

export function createInteraction<T>(canvas: HTMLCanvasElement, point: (e: PointerEvent) => Point,
  pick: (x: number, y: number) => T | undefined, emit: Handler<T>, threshold: number,
  canDrag?: (target: T, event: PointerEvent) => boolean) {
  let controller: AbortController | undefined
  let hover: { target: T | undefined } | undefined
  let gesture: { target: T | undefined; down: PointerEvent; start: Point; last: Point; event: PointerEvent; draggable: boolean; dragging: boolean } | undefined
  let suppressClick: number | undefined

  function leave(event: PointerEvent, p: Point) {
    const previous = hover
    hover = undefined
    if (previous) emit({ type: 'leave', target: previous.target, event, ...p })
  }

  function drag(type: DragType, active: NonNullable<typeof gesture>, event: PointerEvent, p: Point, notify: Handler<T> = emit) {
    if (active.target === undefined) return
    notify({ type, target: active.target, ...p, event, startX: active.start.x, startY: active.start.y,
      dx: p.x - active.start.x, dy: p.y - active.start.y })
  }

  function finish(type: 'dragend' | 'dragcancel', event: PointerEvent, position?: Point, notify: Handler<T> = emit) {
    const active = gesture
    if (!active || event.pointerId !== active.down.pointerId) return
    gesture = undefined
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    if (active.dragging || type === 'dragcancel') suppressClick = event.pointerId
    if (active.dragging) drag(type, active, event, position ?? active.last, notify)
  }

  function release(event: PointerEvent, p: Point) {
    finish('dragend', event, p)
    emit({ type: 'up', target: pick(p.x, p.y), event, ...p })
  }

  function cancelActive(notify: Handler<T> = emit) {
    if (gesture) finish('dragcancel', gesture.event, gesture.last, notify)
  }

  function cancelRegistration(target: T | undefined, notify: Handler<T>) {
    if (gesture?.target === undefined) return
    if (target !== undefined && target !== gesture.target && !Object.is(target, gesture.target)) return
    cancelActive(notify)
  }

  function start() {
    if (controller) return
    controller = new AbortController()
    const options = { signal: controller.signal }
    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0 || gesture) return
      suppressClick = undefined
      const p = point(event)
      const target = pick(p.x, p.y)
      const active = { target, draggable: false, down: event, start: p, last: p, event, dragging: false }
      gesture = active
      active.draggable = target !== undefined && (canDrag?.(target, event) ?? true)
      if (gesture !== active || options.signal.aborted) return
      canvas.setPointerCapture(event.pointerId)
      emit({ type: 'down', target, event, ...p })
    }, options)
    canvas.addEventListener('pointermove', event => {
      if (!event.isPrimary || (gesture && gesture.down.pointerId !== event.pointerId)) return
      const p = point(event)
      const active = gesture
      if (active && !(event.buttons & 1)) {
        // With another button held, the primary release arrives as pointermove.
        release(event, p)
      } else if (active) {
        active.last = p
        active.event = event
        if (active.draggable && !active.dragging && Math.hypot(event.clientX - active.down.clientX, event.clientY - active.down.clientY) >= threshold) {
          active.dragging = true
          drag('dragstart', active, event, p)
        }
        if (gesture === active && active.dragging) drag('drag', active, event, p)
      }
      if (options.signal.aborted) return
      const target = pick(p.x, p.y)
      // SameValueZero, as used by Map (including NaN and signed zero).
      if (!hover || !(hover.target === target || Object.is(hover.target, target))) {
        leave(event, p)
        hover = { target }
        emit({ type: 'enter', target, event, ...p })
      }
      emit({ type: 'move', target, event, ...p })
    }, options)
    canvas.addEventListener('pointerleave', event => { if (event.isPrimary) leave(event, point(event)) }, options)
    canvas.addEventListener('pointerup', event => {
      if (event.isPrimary && (event.button === 0 || gesture?.down.pointerId === event.pointerId)) {
        release(event, point(event))
      }
    }, options)
    canvas.addEventListener('click', event => {
      if (event.detail && suppressClick !== undefined && event.pointerId === suppressClick) return
      const p = point(event)
      emit({ type: 'click', target: pick(p.x, p.y), event, ...p })
    }, options)
    for (const type of ['pointercancel', 'lostpointercapture'] as const) {
      canvas.addEventListener(type, event => finish('dragcancel', event), options)
    }
    canvas.ownerDocument.defaultView?.addEventListener('blur', () => cancelActive(), options)
  }

  function stop() {
    controller?.abort()
    controller = undefined
    hover = undefined
    cancelActive()
  }

  return { start, stop, cancelRegistration }
}

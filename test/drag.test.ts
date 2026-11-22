import { test, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createPicker } from '../src/index.js'

function canvas() {
  const el = document.createElement('canvas')
  el.width = 220
  el.height = 100
  el.style.touchAction = 'none'
  el.style.display = 'block'
  document.body.append(el)
  return el
}

const motion = { sourcePosition: { x: 20, y: 20 }, targetPosition: { x: 180, y: 40 } }

test('drag events retain the starting ID while crossing other targets', async () => {
  const el = canvas()
  const events: { type: string; id: string; dx: number; dy: number }[] = []
  const picker = createPicker(el)
  picker.set('left', ctx => ctx.fillRect(0, 0, 100, 100))
  picker.set('right', ctx => ctx.fillRect(100, 0, 120, 100))
  const stop = picker.track(e => {
    if ('dx' in e) events.push({ type: e.type, id: e.target, dx: e.dx, dy: e.dy })
  })
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events[0]?.type).toBe('dragstart')
    expect(events.some(e => e.type === 'drag')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'dragend', id: 'left', dx: 160, dy: 20 })
    expect(events.every(e => e.id === 'left')).toBe(true)
  } finally { stop(); el.remove() }
})

test('a click or a gesture starting on empty space is not a drag', async () => {
  const el = canvas()
  const events: string[] = []
  const picker = createPicker(el)
  picker.set('left', ctx => ctx.fillRect(0, 0, 100, 100))
  const stop = picker.track(e => { if ('dx' in e) events.push(e.type) })
  try {
    await userEvent.click(el, { position: { x: 20, y: 20 } })
    await userEvent.dragAndDrop(el, el, { sourcePosition: { x: 150, y: 20 }, targetPosition: { x: 180, y: 40 } })
    expect(events).toEqual([])
  } finally { stop(); el.remove() }
})

test('pointer cancellation ends the drag without a later end event', async () => {
  const el = canvas()
  const events: string[] = []
  const picker = createPicker(el)
  picker.set('point', ctx => ctx.fillRect(0, 0, 220, 100))
  const stop = picker.track(e => {
    if ('dx' in e) events.push(e.type)
    if (e.type === 'dragstart') el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.event.pointerId }))
  })
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual(['dragstart', 'dragcancel'])
  } finally { stop(); el.remove() }
})

test('disposing a drag helper removes its interactions', async () => {
  const el = canvas()
  const events: string[] = []
  const picker = createPicker(el)
  picker.set('point', ctx => ctx.fillRect(0, 0, 220, 100))
  picker.track(e => events.push(e.type))
  picker.dispose()
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual([])
  } finally { el.remove() }
})

test('releasing the primary button while a second button is held ends the drag once', async () => {
  const el = canvas()
  const picker = createPicker(el)
  picker.set('handle', ctx => ctx.fillRect(0, 0, 220, 100))
  const events: string[] = []
  picker.track(e => {
    if (e.type === 'dragstart') {
      // Pointer Events reports a chorded button release as pointermove.
      el.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: e.event.pointerId, isPrimary: true, button: 0, buttons: 2,
        clientX: e.event.clientX, clientY: e.event.clientY,
      }))
      el.dispatchEvent(new PointerEvent('pointerup', { pointerId: e.event.pointerId, isPrimary: true, button: 2 }))
    }
    if (e.type === 'dragend' || e.type === 'dragcancel') events.push(e.type)
  })
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual(['dragend'])
  } finally { picker.dispose(); el.remove() }
})

test.each(['delete', 'clear'] as const)('%s cancels the old drag before a replacement can receive it', async operation => {
  const el = canvas()
  const picker = createPicker<number>(el)
  const id = NaN
  const draw = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => ctx.fillRect(0, 0, 220, 100)
  picker.set(id, draw)
  const events: string[] = []
  let capturedAfterRemoval = true
  picker.track(e => { if ('dx' in e) events.push(e.type) })
  picker.on(id, 'drag', () => {
    if (operation === 'delete') picker.delete(id)
    else picker.clear()
  })
  picker.on(id, 'dragcancel', e => {
    events.push('cancel')
    capturedAfterRemoval = el.hasPointerCapture(e.event.pointerId)
    // The cancellation handler can rebuild the widget with the same key.
    picker.set(id, draw)
    picker.on(id, 'drag', () => events.push('replacement drag'))
    picker.on(id, 'dragend', () => events.push('replacement end'))
    picker.on(id, 'click', () => events.push('replacement click'))
  })
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual(['dragstart', 'drag', 'dragcancel', 'cancel'])
    expect(capturedAfterRemoval).toBe(false)
    await userEvent.click(el, { position: { x: 20, y: 20 } })
    expect(events).toEqual(['dragstart', 'drag', 'dragcancel', 'cancel', 'replacement click'])
  } finally { picker.dispose(); el.remove() }
})

test('removing the target before the drag threshold abandons the press', async () => {
  const el = canvas()
  const picker = createPicker(el)
  picker.set('handle', ctx => ctx.fillRect(0, 0, 220, 100))
  const events: string[] = []
  picker.on('handle', 'down', e => {
    picker.delete('handle')
    picker.set('handle', ctx => ctx.fillRect(0, 0, 220, 100))
    picker.track(event => {
      if ('dx' in event || event.type === 'click') events.push(event.type)
    })
    expect(el.hasPointerCapture(e.event.pointerId)).toBe(false)
  })
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual([])
  } finally { picker.dispose(); el.remove() }
})

test('removing another target or updating geometry preserves the active gesture', async () => {
  const el = canvas()
  const picker = createPicker(el)
  const events: string[] = []
  picker.set('handle', ctx => ctx.fillRect(0, 0, 220, 100))
  picker.set('other', ctx => ctx.fillRect(200, 0, 20, 100))
  picker.on('handle', 'dragstart', () => {
    picker.delete('other')
    picker.set('handle', ctx => ctx.fillRect(0, 0, 10, 10))
  })
  picker.on('handle', 'dragcancel', () => events.push('cancel'))
  picker.on('handle', 'dragend', () => events.push('end'))
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual(['end'])
  } finally { picker.dispose(); el.remove() }
})

test.each(['pointercancel', 'lostpointercapture'] as const)('native %s event is forwarded on dragcancel', type => {
  const el = canvas()
  const picker = createPicker(el, { mapPoint: e => ({ x: e.clientX, y: 10 }) })
  picker.set('a', ctx => ctx.fillRect(0, 0, 100, 100))
  const eventTypes: string[] = []
  picker.on('dragcancel', e => eventTypes.push(e.event.type))
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }))
    el.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, pointerId: 1, isPrimary: true, buttons: 1 }))
    el.dispatchEvent(new PointerEvent(type, { clientX: 30, pointerId: 1, isPrimary: true }))
    expect(eventTypes).toEqual([type])
  } finally { picker.dispose(); el.remove() }
})

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

import { test, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { trackDrag } from '../src/drag'

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
  const stop = trackDrag(el, x => x < 100 ? 'left' : 'right', (type, drag) => events.push({ type, id: drag.id, dx: drag.dx, dy: drag.dy }))
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events[0]?.type).toBe('start')
    expect(events.some(e => e.type === 'move')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'end', id: 'left', dx: 160, dy: 20 })
    expect(events.every(e => e.id === 'left')).toBe(true)
  } finally { stop(); el.remove() }
})

test('a click or a gesture starting on empty space is not a drag', async () => {
  const el = canvas()
  const events: string[] = []
  const stop = trackDrag(el, x => x < 100 ? 'left' : undefined, type => events.push(type))
  try {
    await userEvent.click(el, { position: { x: 20, y: 20 } })
    await userEvent.dragAndDrop(el, el, { sourcePosition: { x: 150, y: 20 }, targetPosition: { x: 180, y: 40 } })
    expect(events).toEqual([])
  } finally { stop(); el.remove() }
})

test('pointer cancellation ends the drag without a later end event', async () => {
  const el = canvas()
  const events: string[] = []
  const stop = trackDrag(el, () => 'point', (type, _drag, event) => {
    events.push(type)
    if (type === 'start') el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: event.pointerId }))
  })
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual(['start', 'cancel'])
  } finally { stop(); el.remove() }
})

test('disposing a drag helper removes its interactions', async () => {
  const el = canvas()
  const events: string[] = []
  const stop = trackDrag(el, () => 'point', type => events.push(type))
  stop()
  try {
    await userEvent.dragAndDrop(el, el, motion)
    expect(events).toEqual([])
  } finally { el.remove() }
})

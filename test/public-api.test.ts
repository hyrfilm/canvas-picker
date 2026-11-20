import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createPicker, type PickerEvent } from '../src/index.js'

function surface() {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'display:block;width:200px;height:100px;box-sizing:content-box;padding:10px;border:2px solid;touch-action:none'
  document.body.append(canvas)
  return canvas
}
afterEach(() => document.body.replaceChildren())

test('object keys, z-order, resize and debug drawing share the same lazy buffer', () => {
  const picker = createPicker<object | string | null>({ width: 20, height: 20 })
  const shape = {}
  const draw = (ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D) => ctx.fillRect(1, 1, 12, 12)
  picker.set(shape, draw)
  picker.set('', draw)
  picker.set(shape, draw)
  expect(picker.pick(6, 6)).toBe('')
  picker.delete('')
  picker.resize(80, 40)
  picker.setTransform(new DOMMatrix().translate(40, 10).scale(2))
  const visible = new OffscreenCanvas(80, 40).getContext('2d')!
  picker.drawBuffer(visible)
  expect(visible.getImageData(52, 22, 1, 1).data[3]).toBe(255)
  expect(picker.pick(6, 6)).toBe(shape)
  picker.set(null, draw)
  expect(picker.pick(6, 6)).toBeNull()
  picker.clear()
  expect(picker.pick(6, 6)).toBeUndefined()
})

test('padded and scaled canvas maps a drag into shape units and suppresses its click', async () => {
  const canvas = surface()
  const model = { name: 'knob' }
  const picker = createPicker<typeof model>(canvas, { width: 400, height: 200 })
  picker.setTransform(new DOMMatrix().translate(20, 0).scale(4))
  picker.set(model, ctx => ctx.fillRect(0, 0, 20, 50))
  const events: PickerEvent<typeof model>[] = []
  const stop = picker.track(e => events.push(e))
  let clicks = 0
  const off = picker.on(model, 'click', () => { clicks++ })
  try {
    // Playwright positions are relative to the padding edge.
    await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: { x: 40, y: 30 }, targetPosition: { x: 140, y: 50 } })
    expect(events[0]?.type).toBe('enter')
    expect(events.filter(e => e.type === 'dragend')).toMatchObject([
      { target: model, startX: 10, startY: 10, x: 60, y: 20, dx: 50, dy: 10 },
    ])
    expect(events.find(e => e.type === 'up')?.target).toBeUndefined()
    expect(events.some(e => e.type === 'click')).toBe(false)
    await userEvent.click(canvas, { position: { x: 40, y: 30 } })
    expect(clicks).toBe(1)
    picker.delete(model)
    picker.set(model, ctx => ctx.fillRect(0, 0, 20, 50))
    await userEvent.click(canvas, { position: { x: 40, y: 30 } })
    expect(clicks).toBe(1)
  } finally { stop(); off() }
})

test('cancel during dragstart ends the gesture exactly once', async () => {
  const canvas = surface()
  const picker = createPicker(canvas, { mapPoint: () => ({ x: 5, y: 5 }) })
  picker.set('knob', ctx => ctx.fillRect(0, 0, 10, 10))
  const events: string[] = []
  const stop = picker.track(e => {
    if (e.type.startsWith('drag') || e.type === 'click') events.push(e.type)
    if (e.type === 'dragstart') canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: e.event.pointerId }))
  })
  try {
    await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: { x: 20, y: 20 }, targetPosition: { x: 80, y: 30 } })
    expect(events).toEqual(['dragstart', 'dragcancel'])
  } finally { stop() }
})

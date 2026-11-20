import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Back, Front, createPicker, type StackPosition, type PickerEvent } from '../src/index.js'

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

test('bringing a widget to the front preserves its handlers and a drop can pick through it', async () => {
  const canvas = surface()
  const picker = createPicker(canvas, { width: 200, height: 100 })
  let x = 10
  picker.set('widget', ctx => ctx.fillRect(x, 10, 30, 30))
  picker.set('tray', ctx => ctx.fillRect(0, 0, 180, 80))
  expect(picker.pick(15, 20)).toBe('tray')
  picker.bringToFront('widget')
  let destination: string | undefined
  picker.on('widget', 'drag', e => {
    x = 10 + e.dx
    picker.invalidate()
  })
  picker.on('widget', 'dragend', e => {
    destination = picker.pick(e.x, e.y, { ignore: e.target })
    expect(picker.pick(e.x, e.y)).toBe('widget')
  })
  // Reordering again must retain both scoped handlers.
  picker.sendToBack('widget')
  expect(picker.pick(15, 20)).toBe('tray')
  picker.bringToFront('widget')
  await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: { x: 25, y: 30 }, targetPosition: { x: 125, y: 30 } })
  expect(x).toBe(110)
  expect(destination).toBe('tray')
  picker.dispose()
})

test('sending a target to the back preserves the order of every other target', () => {
  const picker = createPicker({ width: 20, height: 20 })
  for (const id of ['first', 'second', 'third']) picker.set(id, ctx => ctx.fillRect(0, 0, 20, 20))
  picker.sendToBack('third')
  picker.sendToBack('unknown')
  expect(picker.pick(10, 10)).toBe('second')
  expect(picker.pick(10, 10, { ignore: 'second' })).toBe('first')
  picker.delete('first')
  picker.delete('second')
  expect(picker.pick(10, 10)).toBe('third')
})

test('sendTo accepts a position from application state and validates JavaScript inputs', () => {
  const picker = createPicker({ width: 20, height: 20 })
  for (const id of ['widget', 'tray']) picker.set(id, ctx => ctx.fillRect(0, 0, 20, 20))
  const commands: { position: StackPosition; top: string }[] = [
    { position: Front, top: 'widget' },
    { position: Back, top: 'tray' },
  ]
  for (const { position, top } of commands) {
    picker.sendTo('widget', position)
    expect(picker.pick(10, 10)).toBe(top)
  }
  // @ts-expect-error A symbol with the same description is a different value.
  expect(() => picker.sendTo('widget', Symbol('Front'))).toThrow(TypeError)
  // @ts-expect-error Raw strings cannot select a stack position.
  expect(() => picker.sendTo('widget', 'front')).toThrow(TypeError)
  expect(picker.pick(10, 10)).toBe('tray')
})

test('empty-space subscriptions survive clear and disposal removes all subscriptions', async () => {
  const canvas = surface()
  const picker = createPicker(canvas)
  const clicks: string[] = []
  picker.on(undefined, 'click', () => clicks.push('background'))
  picker.on('click', () => clicks.push('canvas'))
  picker.clear()
  await userEvent.click(canvas)
  expect(clicks).toEqual(['canvas', 'background'])
  picker.dispose()
  picker.dispose()
  await userEvent.click(canvas)
  expect(clicks).toHaveLength(2)
  expect(() => picker.track(() => {})).toThrow()
})

test('a declined drag keeps click handling and checks eligibility once per press', async () => {
  const canvas = surface()
  const presses: string[] = []
  const picker = createPicker(canvas, { canDrag: target => { presses.push(target); return false } })
  picker.set('button', ctx => ctx.fillRect(0, 0, 300, 150))
  const events: string[] = []
  picker.track(e => events.push(e.type))
  await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: { x: 25, y: 30 }, targetPosition: { x: 125, y: 30 } })
  expect(presses).toEqual(['button'])
  expect(events).toContain('click')
  expect(events.some(type => type.startsWith('drag'))).toBe(false)
  picker.dispose()
})

test('fractional dimensions round before resizing and invalid sizes preserve the buffer', () => {
  const picker = createPicker({ width: 9.8, height: 9.8 })
  picker.set('plane', ctx => ctx.fillRect(0, 0, 30, 30))
  expect(picker.pick(9, 9)).toBe('plane')
  picker.resize(20.8, 18.2)
  expect(picker.pick(20, 17)).toBe('plane')
  expect(picker.pick(20, 18)).toBeUndefined()
  expect(() => picker.resize(4, NaN)).toThrow()
  expect(picker.pick(20, 17)).toBe('plane')
})

test('disposing during a drag cancels once and releases capture', async () => {
  const canvas = surface()
  const picker = createPicker(canvas)
  picker.set('widget', ctx => ctx.fillRect(0, 0, 300, 150))
  const events: string[] = []
  let pointer = -1
  picker.on('dragstart', e => { pointer = e.event.pointerId; picker.dispose() })
  picker.on('widget', 'dragcancel', () => { events.push('cancel'); picker.dispose() })
  picker.on('dragend', () => events.push('end'))
  await userEvent.dragAndDrop(canvas, canvas, { sourcePosition: { x: 25, y: 30 }, targetPosition: { x: 125, y: 30 } })
  expect(events).toEqual(['cancel'])
  expect(canvas.hasPointerCapture(pointer)).toBe(false)
  expect(picker.pick(20, 20)).toBeUndefined()
})

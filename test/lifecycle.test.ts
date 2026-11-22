import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createIndexPicker } from '../src/index-buffer.js'
import { createPicker } from '../src/index.js'

afterEach(() => document.body.replaceChildren())

test('curved hit parity is identical across repeated picks, invalidation, and drawBuffer', () => {
  const make = () => {
    const p = createPicker({ width: 64, height: 64 })
    p.set('back', ctx => ctx.fillRect(0, 0, 64, 64))
    const path = new Path2D()
    path.arc(32, 32, 22.5, 0, Math.PI * 2)
    p.set('front', ctx => ctx.fill(path))
    return p
  }
  const full = make()
  const fresh = make()
  full.drawBuffer(new OffscreenCanvas(64, 64).getContext('2d')!)

  const diffs: { x: number; y: number; a: string | undefined; b: string | undefined }[] = []
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      fresh.invalidate()
      const a = fresh.pick(x, y)
      const b = full.pick(x, y)
      if (a !== b) diffs.push({ x, y, a, b })
    }
  }
  expect(diffs).toEqual([])
})

test('custom shapes observe the real pick buffer dimensions even with verify disabled', () => {
  const p = createPicker({ width: 80, height: 80, verify: false })
  p.set('back', ctx => ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height))
  expect(Array.from({ length: 5 }, () => p.pick(32, 32))).toEqual(Array(5).fill('back'))
})

test('IndexPicker and createPicker allocate offscreen canvases lazily and dispose releases them', () => {
  const created: OffscreenCanvas[] = []
  const OriginalOffscreenCanvas = globalThis.OffscreenCanvas
  globalThis.OffscreenCanvas = class TrackedOffscreenCanvas extends OriginalOffscreenCanvas {
    constructor(width: number, height: number) {
      super(width, height)
      created.push(this)
    }
  } as typeof OffscreenCanvas

  try {
    // IndexPicker allocates only its main buffer until coverage() is called.
    const indexPicker = createIndexPicker(32, 32)
    expect(created).toHaveLength(1)
    indexPicker.draw(1, ctx => ctx.fillRect(0, 0, 10, 10))
    expect(indexPicker.pick(5, 5)).toBe(1)
    expect(created).toHaveLength(1)
    expect(indexPicker.coverage(ctx => ctx.fillRect(0, 0, 10, 10), 5, 5)).toBe(255)
    expect(created).toHaveLength(2)

    // createPicker allocates 0 canvases until first pick; verify:false allocates only 1 (no probe).
    created.length = 0
    const canvas = document.createElement('canvas')
    const unverified = createPicker(canvas, { width: 200, height: 100, verify: false })
    unverified.set('a', ctx => ctx.fillRect(0, 0, 50, 50))
    expect(created).toHaveLength(0)
    expect(unverified.pick(10, 10)).toBe('a')
    expect(created).toHaveLength(1)
    expect(created[0].width).toBe(200)
    unverified.dispose()
    expect(created[0].width).toBe(0)

    // Verified picker allocates full buffer + 1x1 probe on first hit, and dispose() shrinks both.
    created.length = 0
    const verified = createPicker(canvas, { width: 200, height: 100 })
    verified.set('a', ctx => ctx.fillRect(0, 0, 50, 50))
    expect(created).toHaveLength(0)
    expect(verified.pick(10, 10)).toBe('a')
    expect(created).toHaveLength(2)
    expect(created[0].width).toBe(200)
    expect(created[1].width).toBe(1)
    verified.dispose()
    expect(created[0].width).toBe(0)
    expect(created[1].width).toBe(0)
  } finally {
    globalThis.OffscreenCanvas = OriginalOffscreenCanvas
  }
})

test.each(['replace shape', 'clear and rebuild'] as const)('moving handle during drag: %s', async mode => {
  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'width:220px;height:100px;display:block;touch-action:none'
  document.body.append(canvas)
  const picker = createPicker(canvas, { width: 440, height: 200 })
  const place = (x: number, y: number) => picker.set('attack', ctx => ctx.fillRect(x - 12, y - 12, 24, 24))
  const outcome: string[] = []
  place(40, 40)
  picker.on('drag', e => {
    if (mode === 'clear and rebuild') picker.clear()
    place(e.x, e.y)
  })
  picker.on('dragend', e => outcome.push(e.target, String(e.dx), String(e.dy)))
  picker.on('dragcancel', () => outcome.push('cancel'))
  try {
    await userEvent.dragAndDrop(canvas, canvas, {
      sourcePosition: { x: 20, y: 20 },
      targetPosition: { x: 180, y: 40 },
    })
    expect(outcome).toEqual(mode === 'clear and rebuild' ? ['cancel'] : ['attack', '320', '40'])
  } finally {
    picker.dispose()
  }
})

test('click suppression handles MouseEvent without pointerId and never suppresses keyboard clicks', () => {
  const canvas = document.createElement('canvas')
  canvas.width = 200
  canvas.height = 100
  canvas.style.cssText = 'display:block;width:200px;height:100px'
  document.body.append(canvas)

  const picker = createPicker(canvas, { mapPoint: e => ({ x: e.clientX, y: e.clientY }) })
  picker.set('knob', ctx => ctx.fillRect(0, 0, 200, 100))
  const events: string[] = []
  picker.track(e => events.push(e.type))

  canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 10, clientY: 10 }))
  canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, isPrimary: true, buttons: 1, clientX: 50, clientY: 10 }))
  canvas.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, isPrimary: true, button: 0, buttons: 0, clientX: 50, clientY: 10 }))
  // Plain MouseEvent (no pointerId, like older Safari) must still be suppressed once.
  canvas.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 50, clientY: 10 }))
  // Keyboard-activated click (detail === 0) must pass through.
  canvas.dispatchEvent(new MouseEvent('click', { detail: 0, clientX: 50, clientY: 10 }))
  // Next real click after suppression is consumed must pass through.
  canvas.dispatchEvent(new MouseEvent('click', { detail: 1, clientX: 50, clientY: 10 }))

  expect(events.filter(t => t === 'click')).toHaveLength(2)
  picker.dispose()
})

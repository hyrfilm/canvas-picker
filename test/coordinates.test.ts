import { afterEach, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { canvasPoint, createIndexPicker } from '../src/index-buffer.js'
import { createPicker } from '../src/index.js'

afterEach(() => document.body.replaceChildren())

test('IndexPicker maps CSS pointer events to buffer pixels across resize and DPR scaling', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 200
  canvas.style.cssText = 'display:block;width:200px;height:100px;border:0;padding:0'
  document.body.append(canvas)

  const picker = createIndexPicker(400, 200)
  picker.draw(7, ctx => {
    ctx.arc(80, 60, 12, 0, Math.PI * 2)
    ctx.fill()
  })

  const hits: number[] = []
  canvas.addEventListener('click', event => {
    const p = canvasPoint(canvas, event, picker.ctx.canvas)
    hits.push(picker.pick(p.x, p.y))
  })

  // Canvas-local CSS (40, 30) maps to buffer pixel (80, 60).
  await userEvent.click(canvas, { position: { x: 40, y: 30 } })
  expect(hits).toEqual([7])

  // Resize the pick buffer to 800x400; canvasPoint tracks the updated dimensions.
  picker.ctx.canvas.width = 800
  picker.ctx.canvas.height = 400
  picker.clear()
  picker.draw(19, ctx => {
    ctx.arc(160, 120, 16, 0, Math.PI * 2)
    ctx.fill()
  })

  await userEvent.click(canvas, { position: { x: 40, y: 30 } })
  expect(hits).toEqual([7, 19])
})

test('coordinates agree across border-box, content-box, fractional CSS sizes, CSS scale, and scene transform', async () => {
  for (const boxSizing of ['content-box', 'border-box'] as const) {
    document.body.replaceChildren()
    const canvas = document.createElement('canvas')
    // Fractional CSS dimensions with borders, padding, and axis-aligned CSS scaling.
    const cssWidth = boxSizing === 'border-box' ? '224.5px' : '200.5px'
    const cssHeight = boxSizing === 'border-box' ? '124.25px' : '100.25px'
    canvas.style.cssText = [
      'display:block',
      `box-sizing:${boxSizing}`,
      `width:${cssWidth}`,
      `height:${cssHeight}`,
      'padding:10px',
      'border:2px solid',
      'transform-origin:0 0',
      'transform:scale(1.5, 1.25)',
      'touch-action:none',
    ].join(';')
    document.body.append(canvas)

    const picker = createPicker(canvas, { width: 401, height: 200 })
    const matrix = new DOMMatrix().translate(40, 20).scale(2, 2)
    picker.setTransform(matrix)
    // Scene rect [50..80, 20..40] -> buffer pixels [140..200, 60..100].
    picker.set('target', ctx => ctx.fillRect(50, 20, 30, 20))

    // Manual pick at scene centre (65, 30) must hit.
    expect(picker.pick(65, 30)).toBe('target')

    // Compute exact viewport client coordinates for buffer pixel (170, 80) (scene 65, 30).
    const rect = canvas.getBoundingClientRect()
    const scaleX = 1.5
    const scaleY = 1.25
    const exactClientX = rect.left + (12 + (170 / 401) * 200.5) * scaleX
    const exactClientY = rect.top + (12 + (80 / 200) * 100.25) * scaleY

    // Direct fractional canvasPoint conversion is exact to floating-point precision.
    const mapped = canvasPoint(canvas, { clientX: exactClientX, clientY: exactClientY }, 401, 200)
    expect(mapped.x).toBeCloseTo(170, 4)
    expect(mapped.y).toBeCloseTo(80, 4)

    // Real PointerEvent (which rounds clientX/clientY to integer CSS pixels in DOM) hits target
    // and matches manual picker.pick() at the event's scene coordinates.
    const clicked: { target: string | undefined; x: number; y: number }[] = []
    picker.on('click', e => clicked.push({ target: e.target, x: e.x, y: e.y }))
    canvas.dispatchEvent(new PointerEvent('click', {
      clientX: Math.round(exactClientX),
      clientY: Math.round(exactClientY),
      isPrimary: true,
      detail: 1,
    }))

    expect(clicked).toHaveLength(1)
    expect(clicked[0].target).toBe('target')
    expect(picker.pick(clicked[0].x, clicked[0].y)).toBe('target')
    expect(Math.abs(clicked[0].x - 65)).toBeLessThan(0.5)
    expect(Math.abs(clicked[0].y - 30)).toBeLessThan(0.5)
    picker.dispose()
  }
})

test('hidden or zero-sized canvas maps safely to NaN and picks undefined', () => {
  const canvas = document.createElement('canvas')
  canvas.style.display = 'none'
  document.body.append(canvas)

  const p = canvasPoint(canvas, { clientX: 10, clientY: 10 }, 200, 100)
  expect(Number.isNaN(p.x)).toBe(true)
  expect(Number.isNaN(p.y)).toBe(true)

  const picker = createPicker(canvas, { width: 200, height: 100 })
  picker.set('box', ctx => ctx.fillRect(0, 0, 200, 100))
  const seen: (string | undefined)[] = []
  picker.on('click', e => seen.push(e.target))
  canvas.dispatchEvent(new PointerEvent('click', { clientX: 10, clientY: 10, detail: 1 }))
  expect(seen).toEqual([undefined])
  picker.dispose()
})

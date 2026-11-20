import { test, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createPicker } from '../src/index.js'

test('pointer tracking can be stopped and reattached without duplicate events', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 220
  canvas.height = 100
  canvas.style.display = 'block'
  document.body.append(canvas)
  const picker = createPicker(canvas)
  picker.set('left', ctx => ctx.fillRect(0, 0, 100, 100))
  picker.set('right', ctx => ctx.fillRect(100, 0, 120, 100))
  const first: string[] = [], second: string[] = []
  const stop = picker.track(({ type, target: id }) => {
    first.push(type + ':' + id)
  })
  try {
    await userEvent.click(canvas, { position: { x: 20, y: 20 } })
    expect(first).toContain('click:left')
    const before = first.slice()
    stop()
    await userEvent.click(canvas, { position: { x: 180, y: 20 } })
    expect(first).toEqual(before)

    const stopAgain = picker.track(({ type, target: id }) => {
      second.push(type + ':' + id)
    })
    try {
      await userEvent.click(canvas, { position: { x: 20, y: 20 } })
      expect(first).toEqual(before)
      expect(second).toContain('enter:left')
      expect(second.filter(event => event === 'click:left')).toHaveLength(1)
    } finally { stopAgain() }
  } finally { stop(); canvas.remove() }
})

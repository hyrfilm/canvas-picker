import { test, expect } from 'vitest'
import { userEvent } from 'vitest/browser'
import { trackPointer } from '../src/pick'

test('pointer tracking can be stopped and reattached without duplicate events', async () => {
  const canvas = document.createElement('canvas')
  canvas.width = 220
  canvas.height = 100
  canvas.style.display = 'block'
  document.body.append(canvas)
  const pick = (x: number) => x < 100 ? 'left' : 'right'
  const first: string[] = [], second: string[] = []
  const stop = trackPointer(canvas, pick, (type, id) => {
    first.push(type + ':' + id)
  })
  try {
    await userEvent.click(canvas, { position: { x: 20, y: 20 } })
    expect(first).toContain('click:left')
    const before = first.slice()
    stop()
    await userEvent.click(canvas, { position: { x: 180, y: 20 } })
    expect(first).toEqual(before)

    const stopAgain = trackPointer(canvas, pick, (type, id) => {
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

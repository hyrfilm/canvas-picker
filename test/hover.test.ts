import { afterEach, expect, test } from 'vitest'
import { createHoverMachine } from '../src/hover.js'
import { createPicker } from '../src/index.js'

afterEach(() => document.body.replaceChildren())

test('hover state machine deduplicates repeated targets and transitions A -> B once each', () => {
  const log: string[] = []
  const machine = createHoverMachine<string | number>((type, target) => {
    log.push(`${type}:${String(target)}`)
  })
  const event = new PointerEvent('pointermove', { isPrimary: true })
  const pt = { x: 0, y: 0 }

  machine.move('a', event, pt)
  machine.move('a', event, pt)
  machine.move('b', event, pt)
  machine.move('b', event, pt)
  machine.move(undefined, event, pt)
  machine.move(undefined, event, pt)
  machine.move(NaN, event, pt)
  machine.move(NaN, event, pt)
  machine.leave(event, pt)
  machine.leave(event, pt)

  expect(log).toEqual([
    'enter:a',
    'leave:a',
    'enter:b',
    'leave:b',
    'enter:undefined',
    'leave:undefined',
    'enter:NaN',
    'leave:NaN',
  ])
})

test('a replacement subscription starts cleanly when leave unsubscribes the last listener', () => {
  const canvas = document.createElement('canvas')
  const picker = createPicker(canvas, { mapPoint: e => ({ x: e.clientX, y: 10 }) })
  picker.set('a', ctx => ctx.fillRect(0, 0, 50, 50))
  picker.set('b', ctx => ctx.fillRect(50, 0, 50, 50))

  const received: string[] = []
  const stop = picker.on('a', 'leave', () => {
    stop()
  })
  const move = (clientX: number) =>
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX, isPrimary: true }))

  move(20)
  move(80)
  const stopNext = picker.track(e => received.push(e.type))
  const duringOldMove = received.splice(0)
  move(80)
  stopNext()
  picker.dispose()

  expect({ duringOldMove, nextMove: received }).toEqual({
    duringOldMove: [],
    nextMove: ['enter', 'move'],
  })
})

test('rebuilt targets after clear or delete receive enter on the next move', () => {
  const canvas = document.createElement('canvas')
  const picker = createPicker(canvas, { mapPoint: () => ({ x: 20, y: 20 }) })
  picker.on('move', () => {})

  let entered = 0
  function rebuildWithClear() {
    picker.clear()
    picker.set('step', ctx => ctx.fillRect(0, 0, 50, 50))
    picker.on('step', 'enter', () => { entered++ })
  }

  const move = () => canvas.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true }))
  rebuildWithClear()
  move()
  expect(entered).toBe(1)

  // Rebuilding with clear() resets stale hover for the replaced step.
  rebuildWithClear()
  move()
  expect(entered).toBe(2)

  // Deleting and re-adding the same ID also resets stale hover.
  picker.delete('step')
  picker.set('step', ctx => ctx.fillRect(0, 0, 50, 50))
  picker.on('step', 'enter', () => { entered++ })
  move()
  expect(entered).toBe(3)

  picker.dispose()
})

test('leave handler deleting incoming target does not emit stale enter or move', () => {
  const canvas = document.createElement('canvas')
  const picker = createPicker(canvas, { mapPoint: e => ({ x: e.clientX, y: 10 }) })
  picker.set('a', ctx => ctx.fillRect(0, 0, 20, 20))
  picker.set('b', ctx => ctx.fillRect(20, 0, 20, 20))

  const seen: string[] = []
  picker.on('a', 'leave', () => picker.delete('b'))
  picker.track(e => seen.push(`${e.type}:${String(e.target)}`))

  const move = (clientX: number) =>
    canvas.dispatchEvent(new PointerEvent('pointermove', { isPrimary: true, clientX }))

  move(10)
  move(30)
  picker.dispose()

  expect(seen).toEqual([
    'enter:a',
    'move:a',
    'leave:a',
    'enter:undefined',
    'move:undefined',
  ])
})

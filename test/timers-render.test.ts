import { test, expect } from 'vitest'
import { createStepState } from '../experiments/timers-state'
import { timerPaths, drawDetail, collectStepWidgets, drawDetailWidgets } from '../experiments/timers-render'

test('query and description interfaces paint the same state', () => {
  const state = createStepState()
  const ids = ['address A', 'another/address', 'third']
  state.register(ids[0], { enabled: true, probability: .5 })
  state.register(ids[1], { selected: true })
  state.register(ids[2], { marked: true })
  state.send({ type: 'hover', id: ids[0], active: true })
  state.send({ type: 'playhead', id: ids[2], active: true })
  const geometry = timerPaths(ids, 64, 64, 40).steps
  const contexts = [0, 1].map(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    return canvas.getContext('2d')!
  })
  const style = { color: '#568566', ink: '#1b2228' }
  drawDetail(contexts[0], geometry, ids, state.queries, style)
  drawDetailWidgets(contexts[1], collectStepWidgets(ids, geometry, state.queries), style)
  expect(contexts[0].getImageData(0, 0, 128, 128).data).toEqual(contexts[1].getImageData(0, 0, 128, 128).data)
})

test('step descriptions capture state for one frame', () => {
  const state = createStepState()
  state.register('step', { enabled: true })
  const geometry = timerPaths(['step']).steps
  const frame = collectStepWidgets(['step'], geometry, state.queries)
  state.send({ type: 'toggle', id: 'step' })
  state.send({ type: 'hover', id: 'step', active: true })
  expect(frame[0].enabled).toBe(true)
  expect(frame[0].hovered).toBe(false)
  const next = collectStepWidgets(['step'], geometry, state.queries)
  expect(next[0].enabled).toBe(false)
  expect(next[0].hovered).toBe(true)
})

test('reordering descriptions keeps geometry and state attached to IDs', () => {
  const state = createStepState()
  state.register('first', { enabled: true })
  state.register('second', { selected: true })
  const geometry = timerPaths(['first', 'second']).steps
  const widgets = collectStepWidgets(['second', 'first'], geometry, state.queries)
  expect(widgets[0].path).toBe(geometry.get('second')!.path)
  expect(widgets[0].enabled).toBe(false)
  expect(widgets[0].selected).toBe(true)
  expect(widgets[1].path).toBe(geometry.get('first')!.path)
  expect(widgets[1].enabled).toBe(true)
})

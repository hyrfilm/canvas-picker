import { test, expect } from 'vitest'
import { createStepState } from '../experiments/timers-state'

test('commands address state directly by opaque IDs', () => {
  const state = createStepState()
  state.register('address A', { enabled: true })
  state.register('another/address', { selected: true })
  state.send({ type: 'toggle', id: 'address A' })
  state.send({ type: 'mark', id: 'another/address' })
  state.send({ type: 'toggleProbability', id: 'address A' })
  expect(state.queries.isEnabled('address A')).toBe(false)
  expect(state.queries.isEnabled('another/address')).toBe(false)
  expect(state.queries.isMarked('another/address')).toBe(true)
  expect(state.queries.isSelected('another/address')).toBe(true)
  expect(state.queries.getProbability('address A')).toBe(.5)
})

test('hover and playhead events affect visual state without changing stored values', () => {
  const state = createStepState()
  state.register('step', { enabled: true, selected: true, probability: .5, marked: true })
  state.send({ type: 'hover', id: 'step', active: true })
  state.send({ type: 'playhead', id: 'step', active: true })
  expect(state.queries.isHovered('step')).toBe(true)
  expect(state.queries.isPlaying('step')).toBe(true)
  expect(state.queries.isEnabled('step')).toBe(true)
  expect(state.queries.isSelected('step')).toBe(true)
  expect(state.queries.isMarked('step')).toBe(true)
  expect(state.queries.getProbability('step')).toBe(.5)
  state.send({ type: 'hover', id: 'step', active: false })
  expect(state.queries.isHovered('step')).toBe(false)
  expect(state.queries.isPlaying('step')).toBe(true)
})

test('selection follows an ID when the rendering order changes', () => {
  const state = createStepState()
  const ids = ['first', 'second', 'third']
  ids.forEach(id => state.register(id))
  state.send({ type: 'select', id: 'second' })
  expect([...ids].reverse().filter(state.queries.isSelected)).toEqual(['second'])
  state.send({ type: 'toggle', id: 'second' })
  expect(state.queries.isSelected('second')).toBe(true)
  expect(state.queries.isEnabled('second')).toBe(true)
})

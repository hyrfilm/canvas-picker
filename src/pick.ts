// Original source-level API retained for existing callers.
import { createIndexPicker, type IndexPicker, type Shape } from './index-buffer.js'
import { createRegistry, type PickingOptions } from './registry.js'

export { createIndexPicker as createPicker }
export type { IndexPicker as Picker, Shape }

export function createIdPicker(picker: IndexPicker, options?: PickingOptions) {
  const registry = createRegistry<string>(picker, options)
  return {
    ...registry,
    set(id: string, shape: Shape) {
      if (!id.trim()) throw new Error('Pick IDs cannot be empty or whitespace-only.')
      registry.set(id, shape)
    },
  }
}

export type PointerEventType = 'enter' | 'leave' | 'down' | 'up' | 'click'

// Empty space is a target like any other, with an undefined id. Every event
// carries the id under the pointer or undefined, and moving from a shape onto
// nothing emits leave for the shape, then enter with undefined. The pointer is
// captured on down, so up still arrives when the pointer is released outside
// the element. The returned function removes the listeners.
export function trackPointer(
  el: HTMLElement,
  pick: (x: number, y: number) => string | undefined,
  emit: (type: PointerEventType, id: string | undefined, e: MouseEvent) => void,
) {
  let hovered: string | undefined
  const listeners = new AbortController()
  const options = { signal: listeners.signal }

  function hover(id: string | undefined, e: MouseEvent) {
    if (id === hovered) return
    emit('leave', hovered, e)
    emit('enter', id, e)
    hovered = id
  }

  el.addEventListener('pointermove', (e) => hover(pick(e.offsetX, e.offsetY), e), options)
  el.addEventListener('pointerleave', (e) => hover(undefined, e), options)
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId)
    emit('down', pick(e.offsetX, e.offsetY), e)
  }, options)
  el.addEventListener('pointerup', (e) => emit('up', pick(e.offsetX, e.offsetY), e), options)
  el.addEventListener('click', (e) => emit('click', pick(e.offsetX, e.offsetY), e), options)

  return () => listeners.abort()
}

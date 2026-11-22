// Run `npm run dev`, then open the gallery at /#basics.
// Each example uses its own canvas and picker. They share only the visible shapes.
import { createIndexPicker } from '../src/index-buffer.js'
import { createPicker, filled } from '../src/index.js'

const rectangle = new Path2D()
rectangle.rect(20, 25, 80, 70)

const circle = new Path2D()
circle.arc(170, 60, 30, 0, Math.PI * 2)

function drawShapes(canvas: HTMLCanvasElement) {
  // Keep the canvas, its displayed size, and the pick buffer the same size here.
  // That makes pointer coordinates usable directly, without scaling.
  canvas.width = 240
  canvas.height = 120
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#d47760'
  ctx.fill(rectangle)
  ctx.fillStyle = '#62977c'
  ctx.fill(circle)
}

// 1. createIndexPicker: draw numeric indices into the hidden buffer, then read one.
{
  const canvas = document.querySelector<HTMLCanvasElement>('#indices')!
  const output = document.querySelector<HTMLOutputElement>('#indices-result')!
  drawShapes(canvas)

  const picker = createIndexPicker(canvas.width, canvas.height)
  // The picker sets its own colours. These callbacks draw only the geometry.
  picker.draw(1, filled(rectangle))
  picker.draw(2, filled(circle))

  const index = picker.pick(50, 50) // 1: the rectangle. Empty space returns 0.
  output.textContent = `At (50, 50): ${index}`

  canvas.addEventListener('click', event => {
    const index = picker.pick(event.offsetX, event.offsetY)
    output.textContent = `Index: ${index}`
  })
  // If geometry changes, clear() the buffer and draw the indices again.
}

// 2. createPicker: register the same geometry under names instead of numbers.
{
  const canvas = document.querySelector<HTMLCanvasElement>('#ids')!
  const output = document.querySelector<HTMLOutputElement>('#ids-result')!
  drawShapes(canvas)

  const ids = createPicker(canvas)
  ids.set('rectangle', filled(rectangle))
  ids.set('circle', filled(circle))

  // The buffer is drawn lazily on the first pick after a change.
  const id = ids.pick(50, 50) // 'rectangle'. Empty space returns undefined.
  output.textContent = `At (50, 50): ${id}`

  ids.on('click', ({ target: id }) => {
    output.textContent = `ID: ${id ?? 'empty space'}`
  })
  // Use set/delete to change registrations, or invalidate() if a path changed.
}

// 3. Scoped handlers: turn those IDs into enter/leave/down/up/click events.
{
  const canvas = document.querySelector<HTMLCanvasElement>('#events')!
  const output = document.querySelector<HTMLOutputElement>('#events-result')!
  drawShapes(canvas)

  const ids = createPicker(canvas)
  ids.set('rectangle', filled(rectangle))
  ids.set('circle', filled(circle))

  ids.track(e => {
    if (e.type !== 'move') output.textContent = `${e.type}: ${e.target ?? 'empty space'}`
  })
  ids.on('circle', 'click', () => { output.textContent = 'Circle clicked.' })

  const button = document.querySelector<HTMLButtonElement>('#stop-events')!
  button.addEventListener('click', () => {
    ids.dispose()
    button.disabled = true
    output.textContent = 'Tracking stopped.'
  })
}

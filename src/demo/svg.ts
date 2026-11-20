// Separate SVG paths become separate targets; their appearance stays in the demo.
import source from './curved-triangles.svg?raw'
import { createPicker, filled, type PickingOptions } from '../index.js'
import { canvasPanel } from './canvas'

function svgTriangles(parent: HTMLElement, options: PickingOptions, showBuffer: boolean) {
  const { ctx, canvas, fit, readout } = canvasPanel(parent, 'SVG triangles', 'Paths loaded from an SVG. Hover to thicken an outline; click to invert a triangle’s colour.', 240, 240)
  canvas.style.background = '#fafbfa'
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const shapes = new Map([...document.querySelectorAll('path')].map((element, i) => [
    `triangle-${i + 1}`,
    { path: new Path2D(element.getAttribute('d')!), dark: element.getAttribute('fill') === '#1b2228' },
  ]))
  const ids = createPicker(canvas, { width: 240, height: 240, ...options })
  for (const [id, shape] of shapes) ids.set(id, filled(shape.path))
  let hovered: string | undefined, inversions = 0

  function render() {
    fit()
    if (showBuffer) ids.drawBuffer(ctx)
    else {
      for (const shape of shapes.values()) {
        ctx.fillStyle = shape.dark ? '#1b2228' : '#fafbfa'
        ctx.strokeStyle = '#1b2228'; ctx.lineWidth = .4
        ctx.fill(shape.path); ctx.stroke(shape.path)
      }
      if (hovered) {
        ctx.strokeStyle = '#899a91'; ctx.lineWidth = 2
        ctx.stroke(shapes.get(hovered)!.path)
      }
    }
    readout.textContent = `hover: ${hovered ?? '—'}\ncolour inversions: ${inversions}`
    canvas.style.cursor = hovered ? 'pointer' : 'default'
  }
  const stop = ids.track(e => {
    if (e.type === 'enter') hovered = e.target
    else if (e.type === 'leave') hovered = undefined
    else if (e.type === 'click' && e.target !== undefined) {
      const shape = shapes.get(e.target)!
      shape.dark = !shape.dark
      inversions++
    } else return
    render()
  })
  const resize = new ResizeObserver(render)
  resize.observe(canvas)
  render()
  return () => { stop(); resize.disconnect() }
}

export { svgTriangles }

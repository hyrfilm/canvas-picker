// Separate SVG paths become separate targets; their appearance stays in the demo.
import source from './curved-triangles.svg?raw'
import { createIdPicker, createPicker } from '../pick'
import { filled } from '../shapes'
import { canvasPanel } from './canvas'

function svgTriangles(parent: HTMLElement, options: Parameters<typeof createIdPicker>[1], showBuffer: boolean) {
  const { ctx, canvas, point, fit, readout } = canvasPanel(parent, 'SVG triangles', 'Paths loaded from an SVG. Hover to thicken an outline; click to invert a triangle’s colour.', 240, 240)
  canvas.style.background = '#fafbfa'
  const document = new DOMParser().parseFromString(source, 'image/svg+xml')
  const shapes = new Map([...document.querySelectorAll('path')].map((element, i) => [
    `triangle-${i + 1}`,
    { path: new Path2D(element.getAttribute('d')!), dark: element.getAttribute('fill') === '#1b2228' },
  ]))
  const picker = createPicker(240, 240), ids = createIdPicker(picker, options)
  for (const [id, shape] of shapes) ids.set(id, filled(shape.path))
  let hovered: string | undefined, inversions = 0

  function render() {
    fit()
    if (showBuffer) { ids.pick(-1, -1); ctx.drawImage(picker.ctx.canvas, 0, 0) }
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
  canvas.addEventListener('pointermove', event => { const p = point(event); hovered = ids.pick(p.x, p.y); render() })
  canvas.addEventListener('pointerleave', () => { hovered = undefined; render() })
  canvas.addEventListener('click', event => {
    const p = point(event), id = ids.pick(p.x, p.y)
    if (id !== undefined) { const shape = shapes.get(id)!; shape.dark = !shape.dark; inversions++; render() }
  })
  const resize = new ResizeObserver(render)
  resize.observe(canvas)
  render()
  return () => resize.disconnect()
}

export { svgTriangles }

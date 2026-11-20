import { createPicker } from './index.js'
import { circleScene, collisionScene, thinScene, type Scene } from '../test/scenarios'
import { movingCircles, polygons } from './demo/widgets'
import { svgTriangles } from './demo/svg'

const modes = [
  { name: 'Verify the candidate', verify: true, neighbours: 0, description: 'Check that the shape found in the buffer really covers the pointer. This is the default.' },
  { name: 'Raw colour lookup', verify: false, neighbours: 0, description: 'Trust the colour of one pixel. Blended edges can point to a shape elsewhere.' },
  { name: 'Two matching neighbours', verify: false, neighbours: 2, description: 'Reject isolated colour matches. A repeated blend along an edge can still pass.' },
  { name: 'All eight neighbours', verify: false, neighbours: 8, description: 'Require a solid 3×3 area. Small targets and boundary pixels can disappear.' },
  { name: 'Verify + two neighbours', verify: true, neighbours: 2, description: 'Combine candidate verification with a small amount of neighbour filtering.' },
]

const select = document.querySelector<HTMLSelectElement>('#mode')!
const showBuffer = document.querySelector<HTMLInputElement>('#buffer')!
const grid = document.querySelector<HTMLDivElement>('#scenes')!
const description = document.querySelector<HTMLParagraphElement>('#method')!
for (const [i, mode] of modes.entries()) select.add(new Option(mode.name, String(i)))

const transformed = circleScene(80, 120, 100)
transformed.transform = new DOMMatrix().translate(15.25, 9.75).rotate(17).scale(0.72, 0.58)
const scenes: { name: string; description: string; scene: Scene }[] = [
  { name: 'Thin lines and small dots', description: 'A one-pixel dot, a one-pixel line, and a curve with a wider hit area.', scene: thinScene() },
  { name: 'A troublesome overlap', description: 'The vertical edge at x = 8 can blend into shape-11, even though that shape is elsewhere.', scene: collisionScene() },
  { name: 'Overlapping circles', description: '300 filled and stroked paths. Click to keep a shape selected.', scene: circleScene() },
  { name: 'Transformed paths', description: 'The same picking coordinates work with translation, rotation, and scaling.', scene: transformed },
]

let disposeWidgets: (() => void)[] = []
let renderPanels: (() => void)[] = []

function build() {
  disposeWidgets.forEach(dispose => dispose())
  renderPanels = []
  grid.replaceChildren()
  const mode = modes[Number(select.value)]
  description.textContent = mode.description
  disposeWidgets = [
    polygons(grid, mode, showBuffer.checked),
    movingCircles(grid, mode, showBuffer.checked),
    svgTriangles(grid, mode, showBuffer.checked),
  ]
  for (const entry of scenes) {
    const card = document.createElement('section')
    card.className = 'card'
    const heading = document.createElement('h2')
    heading.textContent = entry.name
    const hint = document.createElement('p')
    hint.textContent = entry.description
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-label', entry.name)
    canvas.style.aspectRatio = `${entry.scene.width} / ${entry.scene.height}`
    const readout = document.createElement('output')
    readout.className = 'readout'
    card.append(heading, hint, canvas, readout)
    grid.append(card)
    const ids = createPicker(canvas, { width: entry.scene.width, height: entry.scene.height, ...mode })
    if (entry.scene.transform) ids.setTransform(entry.scene.transform)
    for (const shape of entry.scene.shapes) ids.set(shape.id, shape.draw)
    const ctx = canvas.getContext('2d')!
    let hovered: string | undefined
    let selected: string | undefined

    function render() {
      const { width, height, transform, shapes } = entry.scene
      canvas.width = Math.round(canvas.clientWidth * devicePixelRatio)
      canvas.height = Math.round(canvas.width * height / width)
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
      if (showBuffer.checked) {
        ids.drawBuffer(ctx)
      } else {
        if (transform) ctx.transform(transform.a, transform.b, transform.c, transform.d, transform.e, transform.f)
        shapes.forEach((shape, i) => {
          ctx.save()
          ctx.beginPath()
          ctx.fillStyle = ctx.strokeStyle = shape.id === hovered || shape.id === selected
            ? '#cc523d' : `hsl(${(i * 137.5 + 135) % 360} 30% 57%)`
          shape.draw(ctx)
          ctx.restore()
        })
      }
      readout.textContent = `hover: ${hovered ?? '—'}\nselected: ${selected ?? '—'}`
      canvas.style.cursor = hovered ? 'pointer' : 'default'
    }

    disposeWidgets.push(ids.track(e => {
      if (e.type === 'enter') hovered = e.target
      else if (e.type === 'leave') hovered = undefined
      else if (e.type === 'down') selected = e.target
      else return
      render()
    }))
    renderPanels.push(render)
    render()
  }
}

select.addEventListener('change', build)
showBuffer.addEventListener('change', build)
window.addEventListener('resize', () => renderPanels.forEach(render => render()))
build()

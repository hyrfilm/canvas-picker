import { createPicker, type PickingOptions } from '../index.js'
import { canvasPanel } from './canvas'

const drawnPolygons: { id: string; path: Path2D; x: number; y: number }[] = []
let nextPolygonId = 0

function polygons(parent: HTMLElement, options: PickingOptions, showBuffer: boolean) {
  const width = 400, height = 260
  const { ctx, canvas, fit, readout, card } = canvasPanel(parent, 'Draw and move polygons', 'Click to add corners. Close the polygon with the button or its first point, then drag it. You can draw more than one.', width, height)
  canvas.tabIndex = 0
  const controls = document.createElement('div')
  controls.className = 'controls'
  const add = document.createElement('button')
  add.textContent = 'New polygon'
  const close = document.createElement('button')
  close.textContent = 'Close polygon'
  const clear = document.createElement('button')
  clear.textContent = 'Clear'
  controls.append(add, close, clear)
  card.insertBefore(controls, canvas)
  type Polygon = typeof drawnPolygons[number]
  const shapes = drawnPolygons
  let draft: { x: number; y: number }[] = [], drawing = shapes.length === 0
  const ids = createPicker<Polygon | 'close-polygon'>(canvas, {
    width, height, ...options, canDrag: target => !drawing && target !== 'close-polygon',
  })
  let selected = shapes.at(-1)
  let hovered: Polygon | 'close-polygon' | undefined, dragging = false
  let origin = { x: 0, y: 0 }
  const registerShape = (shape: typeof shapes[number]) => ids.set(shape, target => {
    target.translate(shape.x, shape.y); target.fill(shape.path)
  })
  shapes.forEach(registerShape)

  function draftChanged() {
    ids.delete('close-polygon')
    if (draft.length >= 3) ids.set('close-polygon', target => {
      target.arc(draft[0].x, draft[0].y, 9, 0, Math.PI * 2); target.fill()
    })
    close.disabled = draft.length < 3
    render()
  }
  function finishPolygon() {
    const path = new Path2D()
    draft.forEach((p, i) => i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y))
    path.closePath()
    const shape = { id: `polygon-${++nextPolygonId}`, path, x: 0, y: 0 }
    shapes.push(shape)
    registerShape(shape)
    selected = shape
    draft = []; drawing = false
    draftChanged()
  }
  close.addEventListener('click', finishPolygon)
  add.addEventListener('click', () => { drawing = true; draft = []; draftChanged() })
  clear.addEventListener('click', () => { shapes.length = 0; ids.clear(); selected = undefined; draft = []; drawing = true; draftChanged() })
  const stop = ids.track(e => {
    const shape = e.target === 'close-polygon' ? undefined : e.target
    switch (e.type) {
      case 'click':
        canvas.focus({ preventScroll: true })
        if (drawing && e.target === 'close-polygon') finishPolygon()
        else if (drawing) { draft.push({ x: e.x, y: e.y }); draftChanged() }
        else selected = shape
        break
      case 'enter': hovered = e.target; break
      case 'leave': hovered = undefined; break
      case 'dragstart':
        if (!shape) return
        selected = shape
        origin = { x: shape.x, y: shape.y }
        dragging = true
        break
      case 'drag':
      case 'dragend':
      case 'dragcancel':
        if (!shape) return
        shape.x = origin.x + (e.type === 'dragcancel' ? 0 : e.dx)
        shape.y = origin.y + (e.type === 'dragcancel' ? 0 : e.dy)
        dragging = e.type === 'drag'
        ids.invalidate()
        break
      default: return
    }
    render()
  })
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') { draft = []; drawing = false; draftChanged() }
    if (event.key === 'Enter' && draft.length >= 3) finishPolygon()
  })
  function render() {
    fit()
    shapes.forEach((shape, i) => {
      ctx.save(); ctx.translate(shape.x, shape.y)
      ctx.fillStyle = ['#609c7b55', '#9b87ad55', '#c3a35255'][i % 3]
      ctx.strokeStyle = selected === shape || hovered === shape ? '#d35c43' : '#6c8c7d'
      ctx.lineWidth = selected === shape ? 2.5 : 1.5
      ctx.fill(shape.path); ctx.stroke(shape.path); ctx.restore()
    })
    if (draft.length) {
      ctx.beginPath(); ctx.moveTo(draft[0].x, draft[0].y)
      draft.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.strokeStyle = '#609c7b'; ctx.lineWidth = 1.5; ctx.stroke()
      draft.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? 5 : 3, 0, Math.PI * 2); ctx.fillStyle = '#609c7b'; ctx.fill() })
    }
    if (showBuffer) { ctx.globalAlpha = .65; ids.drawBuffer(ctx); ctx.globalAlpha = 1 }
    const shape = selected
    readout.textContent = drawing ? `${draft.length} corners · drawing` : `selected: ${selected?.id ?? '—'}${shape ? ` · offset ${Math.round(shape.x)}, ${Math.round(shape.y)}` : ''}`
    canvas.style.cursor = drawing ? 'crosshair' : dragging ? 'grabbing' : hovered ? 'grab' : 'default'
  }
  draftChanged()
  let resizeFrame = 0
  const resize = new ResizeObserver(() => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; render() })
  })
  resize.observe(canvas)
  return () => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame)
    resize.disconnect()
    stop()
    ids.dispose()
  }
}

export { polygons }

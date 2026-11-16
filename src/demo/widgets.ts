import { createIdPicker, createPicker } from '../pick'
import { trackDrag } from '../drag'
import { circleScene } from '../../test/scenarios'
import { canvasPanel } from './canvas'

type Options = Parameters<typeof createIdPicker>[1]
let circleTime = 0, circlesPaused = false
const drawnPolygons: { id: string; path: Path2D; x: number; y: number }[] = []
let nextPolygonId = 0

function movingCircles(parent: HTMLElement, options: Options, showBuffer: boolean) {
  const view = canvasPanel(parent, 'Moving circles', 'Hover a moving shape, or click to keep it selected. Picking also updates while the pointer stays still.', 320, 220)
  const { ctx, canvas, point, fit, readout, card } = view
  const button = document.createElement('button')
  button.textContent = circlesPaused ? 'Resume circles' : 'Pause circles'
  card.insertBefore(button, canvas)
  const scene = circleScene(80, 320, 220)
  const picker = createPicker(320, 220)
  const ids = createIdPicker(picker, options)
  let previous = performance.now()
  let pointer: { x: number; y: number } | undefined
  let selected: string | undefined
  for (const [i, shape] of scene.shapes.entries()) {
    const draw = shape.draw
    shape.draw = target => {
      target.translate(Math.sin(circleTime * .6 + i) * 14, Math.cos(circleTime * .45 + i * .7) * 12)
      draw(target)
    }
    ids.set(shape.id, shape.draw)
  }
  button.addEventListener('click', () => { circlesPaused = !circlesPaused; button.textContent = circlesPaused ? 'Resume circles' : 'Pause circles' })
  canvas.addEventListener('pointermove', event => { pointer = point(event) })
  canvas.addEventListener('pointerleave', () => { pointer = undefined })
  canvas.addEventListener('click', event => { const p = point(event); selected = ids.pick(p.x, p.y) })
  let frame: number
  function render(now: number) {
    if (!circlesPaused) { circleTime += Math.min((now - previous) / 1000, .05); ids.invalidate() }
    previous = now
    const hovered = pointer ? ids.pick(pointer.x, pointer.y) : undefined
    fit()
    if (showBuffer) { ids.pick(-1, -1); ctx.drawImage(picker.ctx.canvas, 0, 0) }
    else scene.shapes.forEach((shape, i) => {
      ctx.save(); ctx.beginPath()
      ctx.fillStyle = ctx.strokeStyle = shape.id === hovered || shape.id === selected ? '#d35c43' : `hsl(${(i * 137.5 + 135) % 360} 32% 58%)`
      shape.draw(ctx)
      ctx.restore()
    })
    readout.textContent = `hover: ${hovered ?? '—'}\nselected: ${selected ?? '—'}`
    canvas.style.cursor = hovered ? 'pointer' : 'default'
    frame = requestAnimationFrame(render)
  }
  frame = requestAnimationFrame(render)
  return () => cancelAnimationFrame(frame)
}

function polygons(parent: HTMLElement, options: Options, showBuffer: boolean) {
  const width = 400, height = 260
  const { ctx, canvas, point, fit, readout, card } = canvasPanel(parent, 'Draw and move polygons', 'Click to add corners. Close the polygon with the button or its first point, then drag it. You can draw more than one.', width, height)
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
  const picker = createPicker(width, height), ids = createIdPicker(picker, options)
  const shapes = drawnPolygons
  let draft: { x: number; y: number }[] = [], drawing = shapes.length === 0
  let selected = shapes.at(-1)?.id
  let hovered: string | undefined, dragging = false
  let origin = { x: 0, y: 0 }
  const registerShape = (shape: typeof shapes[number]) => ids.set(shape.id, target => {
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
    selected = shape.id
    draft = []; drawing = false
    draftChanged()
  }
  close.addEventListener('click', finishPolygon)
  add.addEventListener('click', () => { drawing = true; draft = []; draftChanged() })
  clear.addEventListener('click', () => { shapes.length = 0; ids.clear(); selected = undefined; draft = []; drawing = true; draftChanged() })
  const stopDrag = trackDrag(canvas, (x, y) => drawing ? undefined : ids.pick(x * width / canvas.clientWidth, y * height / canvas.clientHeight), (type, drag) => {
    const shape = shapes.find(item => item.id === drag.id)!
    if (type === 'start') { selected = shape.id; origin = { x: shape.x, y: shape.y }; dragging = true }
    if (type === 'cancel') { shape.x = origin.x; shape.y = origin.y }
    else { shape.x = origin.x + drag.dx * width / canvas.clientWidth; shape.y = origin.y + drag.dy * height / canvas.clientHeight }
    if (type === 'end' || type === 'cancel') dragging = false
    ids.invalidate()
    render()
  })
  canvas.addEventListener('click', event => {
    canvas.focus({ preventScroll: true })
    const p = point(event)
    const id = ids.pick(p.x, p.y)
    if (drawing) {
      if (id === 'close-polygon') finishPolygon()
      else { draft.push(p); draftChanged() }
    } else { selected = id; render() }
  })
  canvas.addEventListener('pointermove', event => {
    const p = point(event)
    hovered = ids.pick(p.x, p.y)
    render()
  })
  canvas.addEventListener('pointerleave', () => { hovered = undefined; render() })
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') { draft = []; drawing = false; draftChanged() }
    if (event.key === 'Enter' && draft.length >= 3) finishPolygon()
  })
  function render() {
    fit()
    shapes.forEach((shape, i) => {
      ctx.save(); ctx.translate(shape.x, shape.y)
      ctx.fillStyle = ['#609c7b55', '#9b87ad55', '#c3a35255'][i % 3]
      ctx.strokeStyle = selected === shape.id || hovered === shape.id ? '#d35c43' : '#6c8c7d'
      ctx.lineWidth = selected === shape.id ? 2.5 : 1.5
      ctx.fill(shape.path); ctx.stroke(shape.path); ctx.restore()
    })
    if (draft.length) {
      ctx.beginPath(); ctx.moveTo(draft[0].x, draft[0].y)
      draft.slice(1).forEach(p => ctx.lineTo(p.x, p.y))
      ctx.strokeStyle = '#609c7b'; ctx.lineWidth = 1.5; ctx.stroke()
      draft.forEach((p, i) => { ctx.beginPath(); ctx.arc(p.x, p.y, i === 0 ? 5 : 3, 0, Math.PI * 2); ctx.fillStyle = '#609c7b'; ctx.fill() })
    }
    if (showBuffer) { ids.pick(-1, -1); ctx.globalAlpha = .65; ctx.drawImage(picker.ctx.canvas, 0, 0); ctx.globalAlpha = 1 }
    const shape = shapes.find(item => item.id === selected)
    readout.textContent = drawing ? `${draft.length} corners · drawing` : `selected: ${selected ?? '—'}${shape ? ` · offset ${Math.round(shape.x)}, ${Math.round(shape.y)}` : ''}`
    canvas.style.cursor = drawing ? 'crosshair' : dragging ? 'grabbing' : hovered ? 'grab' : 'default'
  }
  draftChanged()
  const resize = new ResizeObserver(render)
  resize.observe(canvas)
  return () => { resize.disconnect(); stopDrag() }
}

export { movingCircles, polygons }

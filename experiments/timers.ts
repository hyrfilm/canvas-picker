// Bind IDs to input callbacks, route commands to state, then pull a view each frame.
// Both rendering interfaces below use the same state and the same pick geometry.
import { createIdPicker, createPicker, trackPointer, type Shape, type PointerEventType } from '../src/pick'
import { filled } from '../src/shapes'
import { trackDrag } from '../src/drag'
import { createStepState, type StepEvent, type StepAction } from './timers-state'
import { circlePath, timerPaths, drawMini, drawDetailFrame, drawDetail, collectStepWidgets, drawDetailWidgets } from './timers-render'

const width = 720, height = 590
const canvas = document.querySelector<HTMLCanvasElement>('#timers')!
canvas.style.aspectRatio = width + ' / ' + height
const ctx = canvas.getContext('2d')!
const output = document.querySelector<HTMLOutputElement>('#timer-state')!
const eventOutput = document.querySelector<HTMLOutputElement>('#event-state')!
const play = document.querySelector<HTMLButtonElement>('#play')!
const stepCount = document.querySelector<HTMLInputElement>('#steps')!
const showBuffer = document.querySelector<HTMLInputElement>('#buffer')!
const renderer = document.querySelector<HTMLSelectElement>('#renderer')!
const clickAction = document.querySelector<HTMLSelectElement>('#click-action')!
const contract = document.querySelector<HTMLElement>('#render-contract')!

const state = createStepState()
const stepNames = new Map<string, string>()
function allocateStep(name: string, order: number, enabled = false) {
  const id = crypto.randomUUID()
  state.register(id, { enabled })
  stepNames.set(id, name + ' step ' + String(order + 1).padStart(2, '0'))
  return id
}

type Timer = {
  id: string; name: string; color: string; period: number; phase: number
  count: number; stepIds: string[]; playingId?: string
}
const presets = [
  { id: 'moss', name: 'Moss', color: '#568566', period: 3.2, phase: .2, count: 16, enabled: [0, 3, 6, 8, 11, 14] },
  { id: 'ochre', name: 'Ochre', color: '#ad8146', period: 4.6, phase: .55, count: 11, enabled: [0, 2, 5, 8] },
  { id: 'iris', name: 'Iris', color: '#8f7ca9', period: 2.4, phase: .8, count: 24, enabled: [0, 3, 6, 9, 12, 15, 18, 21] },
]
const timers: Timer[] = presets.map(preset => ({
  id: preset.id, name: preset.name, color: preset.color,
  period: preset.period, phase: preset.phase, count: preset.count,
  stepIds: Array.from({ length: preset.count }, (_, i) => allocateStep(preset.name, i, preset.enabled.includes(i))),
}))

// The single state handler receives the same command shape from all sources.
const events = new EventTarget()
let lastEdit = 'No edits yet'
function handleStepEvent(event: Event) {
  const command = (event as CustomEvent<StepEvent>).detail
  state.send(command)
  if (command.type !== 'hover' && command.type !== 'playhead') {
    lastEdit = command.type + ' · ' + stepNames.get(command.id)! + '\n' + command.id
  }
}
events.addEventListener('step', handleStepEvent)
function send(command: StepEvent) {
  events.dispatchEvent(new CustomEvent('step', { detail: command }))
}

const picker = createPicker(width, height), ids = createIdPicker(picker)
const listeners = new Map<string, (type: PointerEventType, event: MouseEvent) => void>()
let current = timers[0], currentIds = current.stepIds.slice(0, current.count)
let geometry = timerPaths(currentIds)
let playing = true, scrubbing = false, phaseAtStart = 0, pointerCursor = 'default'
const point = (x: number, y: number) => ({ x: x * width / canvas.clientWidth, y: y * height / canvas.clientHeight })
const pick = (x: number, y: number) => { const p = point(x, y); return ids.pick(p.x, p.y) }

// A local experiment in binding a shape and its input callback together.
// The picker itself still only handles geometry and IDs.
function registerShape(id: string, shape: Shape, onInput: (type: PointerEventType, event: MouseEvent) => void) {
  ids.set(id, shape)
  listeners.set(id, onInput)
}
function registerGeometry() {
  ids.clear()
  timers.forEach((timer, order) => registerShape(timer.id, filled(circlePath(240 + order * 120, 54, 29), 4), type => {
    if (type === 'click') { current = timer; stepCount.value = String(current.count); registerGeometry() }
  }))
  currentIds = current.stepIds.slice(0, current.count)
  geometry = timerPaths(currentIds)
  for (const [id, step] of geometry.steps) {
    registerShape(id, filled(step.path, 5), (type, event) => {
      if (type === 'enter' || type === 'leave') send({ type: 'hover', id, active: type === 'enter' })
      if (type === 'click') send({ type: event.shiftKey ? 'select' : clickAction.value as StepAction, id })
    })
  }
  registerShape('phase', filled(geometry.face), () => {})
  // Retain callbacks for existing state addresses: a later leave event can
  // still refer to a step from the previously displayed timer.
}

trackPointer(canvas, pick, (type, id, event) => {
  if (type === 'enter') pointerCursor = id === 'phase' ? 'grab' : id === undefined ? 'default' : 'pointer'
  if (id !== undefined) listeners.get(id)!(type, event)
})
trackDrag(canvas, (x, y) => pick(x, y) === 'phase' ? 'phase' : undefined, (type, drag) => {
  if (type === 'start') { phaseAtStart = current.phase; scrubbing = true }
  current.phase = type === 'cancel' ? phaseAtStart : ((phaseAtStart + drag.dx / canvas.clientWidth) % 1 + 1) % 1
  if (type === 'end' || type === 'cancel') scrubbing = false
})
play.addEventListener('click', () => { playing = !playing; play.textContent = playing ? 'Pause' : 'Play' })
document.querySelector('#external-toggle')!.addEventListener('click', () => send({ type: 'toggle', id: currentIds[0] }))
stepCount.addEventListener('change', () => {
  if (!stepCount.checkValidity() || !Number.isInteger(stepCount.valueAsNumber)) return
  // An address and its state survive hiding a step and showing it again.
  while (current.stepIds.length < stepCount.valueAsNumber) {
    current.stepIds.push(allocateStep(current.name, current.stepIds.length))
  }
  current.count = stepCount.valueAsNumber
  registerGeometry()
})
renderer.addEventListener('change', updateContract)
function updateContract() {
  contract.textContent = renderer.value === 'queries'
    ? 'drawDetail(ctx, geometry, ids, stateQueries, style)'
    : 'drawDetailWidgets(ctx, stepWidgets, style)'
}

function advancePlayheads(elapsed: number) {
  for (const timer of timers) {
    if (playing && !(scrubbing && timer === current)) timer.phase = (timer.phase + elapsed / timer.period) % 1
    const next = timer.stepIds[Math.floor(timer.phase * timer.count)]
    if (next === timer.playingId) continue
    if (timer.playingId !== undefined) send({ type: 'playhead', id: timer.playingId, active: false })
    send({ type: 'playhead', id: next, active: true })
    timer.playingId = next
  }
}

let ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() })
let previous = performance.now()
function frame(now: number) {
  advancePlayheads(Math.min((now - previous) / 1000, .05))
  previous = now
  const w = Math.round(canvas.clientWidth * devicePixelRatio), h = Math.round(w * height / width)
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
  ctx.clearRect(0, 0, width, height)
  timers.forEach((timer, i) => drawMini(ctx, 240 + i * 120, 54, timer.phase, timer.color, timer === current, timer.name, ink))
  drawDetailFrame(ctx, geometry, current, ink)
  const style = { color: current.color, ink }
  if (renderer.value === 'queries') {
    drawDetail(ctx, geometry.steps, currentIds, state.queries, style)
  } else {
    const stepWidgets = collectStepWidgets(currentIds, geometry.steps, state.queries)
    drawDetailWidgets(ctx, stepWidgets, style)
  }
  if (showBuffer.checked) { ids.pick(-1, -1); ctx.globalAlpha = .75; ctx.drawImage(picker.ctx.canvas, 0, 0); ctx.globalAlpha = 1 }
  canvas.style.cursor = scrubbing ? 'grabbing' : pointerCursor
  const enabled = currentIds.filter(state.queries.isEnabled).length
  const selected = currentIds.filter(state.queries.isSelected).length
  const probability = currentIds.filter(id => state.queries.getProbability(id) < 1).length
  const marked = currentIds.filter(state.queries.isMarked).length
  const hovered = currentIds.find(state.queries.isHovered)
  const active = currentIds.find(state.queries.isPlaying)!
  output.textContent = current.name + ' · ' + enabled + '/' + current.count + ' enabled · ' + selected + ' selected · ' + probability + ' probability · ' + marked + ' marked\nhover: ' + (hovered ? stepNames.get(hovered) : '—') + ' · playhead: ' + stepNames.get(active)
  eventOutput.textContent = 'Last edit: ' + lastEdit
  requestAnimationFrame(frame)
}
registerGeometry()
updateContract()
requestAnimationFrame(frame)

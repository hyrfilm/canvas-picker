// A standalone rendering study based on Wednesday's timer ring. Geometry is
// shared by drawing and picking; these functions know nothing about the page.
type StepQueries = {
  isEnabled(id: string): boolean
  isSelected(id: string): boolean
  isHovered(id: string): boolean
  isPlaying(id: string): boolean
  isMarked(id: string): boolean
  getProbability(id: string): number
}

type StepGeometry = {
  path: Path2D
  x: number
  y: number
  label: string
  labelX: number
  labelY: number
}

type StepWidget = StepGeometry & {
  id: string
  enabled: boolean
  selected: boolean
  hovered: boolean
  playing: boolean
  marked: boolean
  probability: number
}

type StepStyle = { color: string; ink: string }

function circlePath(x: number, y: number, radius: number) {
  const path = new Path2D()
  path.arc(x, y, radius, 0, Math.PI * 2)
  return path
}

function timerPaths(ids: readonly string[], x = 360, y = 350, radius = 200) {
  const inner = radius * .64, mid = (inner + radius) / 2
  const ring = new Path2D()
  ring.arc(x, y, radius, 0, Math.PI * 2)
  ring.arc(x, y, inner, 0, Math.PI * 2, true)
  const steps = new Map(ids.map((id, order) => {
    const angle = -Math.PI / 2 + order / ids.length * Math.PI * 2
    const point = { x: x + Math.cos(angle) * mid, y: y + Math.sin(angle) * mid }
    return [id, {
      ...point,
      path: circlePath(point.x, point.y, 8),
      label: String(order + 1).padStart(2, '0'),
      labelX: x + Math.cos(angle) * (radius + 18),
      labelY: y + Math.sin(angle) * (radius + 18) + 3,
    }]
  }))
  return { x, y, radius, inner, ring, face: circlePath(x, y, inner - 10), steps }
}

function drawMini(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number, color: string, selected: boolean, label: string, ink: string) {
  ctx.save()
  ctx.fillStyle = color; ctx.globalAlpha = .13
  ctx.fill(circlePath(x, y, 29))
  ctx.globalAlpha = .8; ctx.strokeStyle = color; ctx.lineWidth = selected ? 2 : .7
  ctx.stroke(circlePath(x, y, 29))
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 24, -Math.PI / 2, -Math.PI / 2 + phase * Math.PI * 2); ctx.closePath()
  ctx.globalAlpha = .25; ctx.fill()
  ctx.globalAlpha = 1; ctx.fillStyle = color
  const angle = phase * Math.PI * 2 - Math.PI / 2
  ctx.fill(circlePath(x + Math.cos(angle) * 24, y + Math.sin(angle) * 24, 3.3))
  ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = ink
  ctx.fillText(label, x, y + 49)
  ctx.restore()
}

function drawDetailFrame(
  ctx: CanvasRenderingContext2D,
  paths: ReturnType<typeof timerPaths>,
  state: { phase: number; name: string; color: string },
  ink: string,
) {
  const { x, y, radius, inner } = paths
  ctx.save()
  ctx.fillStyle = state.color; ctx.globalAlpha = .055; ctx.fill(paths.ring)
  ctx.globalAlpha = .45; ctx.strokeStyle = state.color; ctx.lineWidth = .9
  ctx.stroke(circlePath(x, y, radius)); ctx.stroke(circlePath(x, y, inner))
  ctx.globalAlpha = .08
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, inner - 10, -Math.PI / 2, -Math.PI / 2 + state.phase * Math.PI * 2); ctx.closePath(); ctx.fill()
  ctx.globalAlpha = 1
  const angle = state.phase * Math.PI * 2 - Math.PI / 2
  ctx.fillStyle = state.color
  ctx.fill(circlePath(x + Math.cos(angle) * (inner - 20), y + Math.sin(angle) * (inner - 20), 4))
  ctx.fillStyle = ink; ctx.textAlign = 'center'
  ctx.font = '13px system-ui'; ctx.fillText(state.name, x, y - 22)
  ctx.font = '30px ui-monospace, monospace'; ctx.fillText(state.phase.toFixed(3), x, y + 14)
  ctx.globalAlpha = .55; ctx.font = '10px system-ui'; ctx.fillText('DRAG TO SCRUB', x, y + 40)
  ctx.restore()
}

// Both interfaces share only the actual painting. A widget is a plain snapshot
// for this frame: no listeners, setters, subscriptions, or component instances.
function drawStep(ctx: CanvasRenderingContext2D, step: StepWidget, style: StepStyle) {
  ctx.save()
  ctx.fillStyle = ctx.strokeStyle = style.color
  ctx.lineWidth = 1.3
  if (step.playing) {
    ctx.globalAlpha = .18; ctx.fill(circlePath(step.x, step.y, 16)); ctx.globalAlpha = 1
  }
  if (step.enabled) ctx.fill(step.path)
  else ctx.stroke(step.path)
  if (step.selected || step.hovered) {
    ctx.globalAlpha = step.selected ? .95 : .55
    ctx.stroke(circlePath(step.x, step.y, step.selected ? 14 : 11.5)); ctx.globalAlpha = 1
  }
  if (step.probability < 1) {
    ctx.beginPath(); ctx.arc(step.x, step.y, 11.5, -Math.PI / 2, -Math.PI / 2 + step.probability * Math.PI * 2)
    ctx.lineWidth = 2.5; ctx.stroke()
  }
  if (step.marked) {
    ctx.beginPath(); ctx.moveTo(step.x + 10, step.y - 15); ctx.lineTo(step.x + 13, step.y - 12)
    ctx.lineTo(step.x + 10, step.y - 9); ctx.lineTo(step.x + 7, step.y - 12); ctx.closePath(); ctx.fill()
  }
  ctx.fillStyle = style.ink; ctx.globalAlpha = .55
  ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'center'
  ctx.fillText(step.label, step.labelX, step.labelY)
  ctx.restore()
}

function stepWidget(id: string, geometry: ReadonlyMap<string, StepGeometry>, state: StepQueries): StepWidget {
  return {
    id, ...geometry.get(id)!,
    enabled: state.isEnabled(id), selected: state.isSelected(id),
    hovered: state.isHovered(id), playing: state.isPlaying(id),
    marked: state.isMarked(id), probability: state.getProbability(id),
  }
}

function drawDetail(ctx: CanvasRenderingContext2D, geometry: ReadonlyMap<string, StepGeometry>, ids: Iterable<string>, stateQueries: StepQueries, style: StepStyle) {
  for (const id of ids) drawStep(ctx, stepWidget(id, geometry, stateQueries), style)
}

function collectStepWidgets(ids: Iterable<string>, geometry: ReadonlyMap<string, StepGeometry>, stateQueries: StepQueries) {
  return Array.from(ids, id => stepWidget(id, geometry, stateQueries))
}

function drawDetailWidgets(ctx: CanvasRenderingContext2D, stepWidgets: Iterable<StepWidget>, style: StepStyle) {
  for (const widget of stepWidgets) drawStep(ctx, widget, style)
}

export { circlePath, timerPaths, drawMini, drawDetailFrame, drawDetail, collectStepWidgets, drawDetailWidgets }
export type { StepQueries, StepWidget }

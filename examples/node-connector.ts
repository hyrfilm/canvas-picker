import { createPicker, filled, type Point } from '../src/index.js'

const canvas = document.querySelector<HTMLCanvasElement>('#connector-field')!
const status = document.querySelector<HTMLOutputElement>('#connector-status')!
const clear = document.querySelector<HTMLButtonElement>('#clear-connections')!
const ctx = canvas.getContext('2d')!
const picker = createPicker<Port>(canvas, { canDrag: () => false })
const dark = matchMedia('(prefers-color-scheme: dark)')
const palette = ['#b5caaa', '#d8b78e', '#cba5a0', '#9dbfc0', '#b6afd0', '#9eabbf']

type Port = Point & { node: number; kind: 'inlet' | 'outlet' }
type Connection = { from: Port; to: Port }

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const slots = Array.from({ length: 12 }, (_, i) => i)
for (let i = slots.length - 1; i > 0; i--) {
  const j = randomInt(0, i)
  const slot = slots[i]
  slots[i] = slots[j]
  slots[j] = slot
}

const nodes = slots.slice(0, randomInt(7, 12)).map(slot => {
  const ports = (kind: Port['kind']): Port[] =>
    Array.from({ length: randomInt(1, 5) }, () => ({ node: slot, kind, x: 0, y: 0 }))

  return {
    slot,
    offsetX: Math.random() - .5,
    offsetY: Math.random() - .5,
    colour: palette[randomInt(0, palette.length - 1)],
    body: new Path2D(),
    inputs: ports('inlet'),
    outputs: ports('outlet'),
  }
})

let width = 1, height = 1
let source: Port | undefined
let hovered: Port | undefined
let pointer: Point | undefined
const connections: Connection[] = []

function cable(from: Point, to: Point, colour: string, preview = false) {
  // Longer cables hang lower. The handles leave the outlet downwards and
  // round the bottom of the curve before lifting back up to the inlet.
  const length = Math.hypot(to.x - from.x, to.y - from.y)
  const sag = Math.min(length * .39, 108)
  const dx = to.x - from.x
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.bezierCurveTo(from.x + dx * .13, from.y + sag, to.x - dx * .13, to.y + sag * .55, to.x, to.y)
  ctx.strokeStyle = colour
  ctx.lineWidth = preview ? 2 : 2.5
  ctx.setLineDash(preview ? [4, 4] : [])
  ctx.stroke()
  ctx.setLineDash([])
}

function render() {
  const wire = dark.matches ? '#9bc7ba' : '#416d62'
  const edge = dark.matches ? '#1d2b28' : '#46564e'
  const inletFill = dark.matches ? '#eef5ef' : '#fbfaf6'
  ctx.clearRect(0, 0, width, height)

  for (const { from, to } of connections) cable(from, to, wire)
  if (source && pointer) {
    const end = hovered?.kind === 'inlet' && hovered.node !== source.node ? hovered : pointer
    cable(source, end, wire, true)
  }

  for (const node of nodes) {
    ctx.fillStyle = node.colour
    ctx.fill(node.body)
    ctx.lineWidth = 1
    ctx.strokeStyle = edge
    ctx.stroke(node.body)
    for (const port of [...node.inputs, ...node.outputs]) {
      ctx.beginPath()
      ctx.arc(port.x, port.y, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = port.kind === 'inlet' ? inletFill : edge
      ctx.strokeStyle = edge
      ctx.fill()
      ctx.stroke()
      if (port === source || port === hovered) {
        ctx.beginPath()
        ctx.arc(port.x, port.y, 7.5, 0, Math.PI * 2)
        ctx.strokeStyle = wire
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.lineWidth = 1
      }
    }
  }
  canvas.style.cursor = hovered ? 'pointer' : ''
}

let resizeFrame = 0

function resize() {
  resizeFrame = 0
  const rect = canvas.getBoundingClientRect()
  const nextWidth = Math.max(1, Math.round(rect.width))
  const nextHeight = Math.max(1, Math.round(rect.height))
  const nextBitmapWidth = Math.max(1, Math.round(nextWidth * devicePixelRatio))
  const nextBitmapHeight = Math.max(1, Math.round(nextHeight * devicePixelRatio))
  if (
    nextWidth === width &&
    nextHeight === height &&
    canvas.width === nextBitmapWidth &&
    canvas.height === nextBitmapHeight
  ) return
  width = nextWidth
  height = nextHeight
  canvas.width = nextBitmapWidth
  canvas.height = nextBitmapHeight
  ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
  picker.resize(width, height)

  const columns = width >= 800 ? 4 : width >= 490 ? 3 : 2
  const cellWidth = width / columns
  const cellHeight = height / (12 / columns)
  const nodeWidth = Math.min(138, cellWidth * .7)
  const nodeHeight = 38
  for (const node of nodes) {
    const x = (node.slot % columns + .5) * cellWidth + node.offsetX * Math.min(38, cellWidth * .22)
    const y = (Math.floor(node.slot / columns) + .5) * cellHeight + node.offsetY * 25
    node.body = new Path2D()
    node.body.roundRect(x - nodeWidth / 2, y - nodeHeight / 2, nodeWidth, nodeHeight, 9)
    for (const ports of [node.inputs, node.outputs]) {
      ports.forEach((port, i) => {
        port.x = x + (i - (ports.length - 1) / 2) * Math.min(19, nodeWidth / 5)
        port.y = y + (port.kind === 'inlet' ? -.5 : .5) * nodeHeight
        const path = new Path2D()
        path.arc(port.x, port.y, 8, 0, Math.PI * 2)
        picker.set(port, filled(path))
      })
    }
  }
  hovered = pointer = undefined
  render()
}

function updateStatus(message?: string) {
  const count = connections.length
  status.textContent = message ?? (source ? 'Choose an inlet on another node.' : `${count} connection${count === 1 ? '' : 's'}`)
  clear.disabled = !count && !source
  render()
}

picker.on('move', ({ target, x, y }) => { hovered = target; pointer = { x, y }; render() })
canvas.addEventListener('pointerleave', () => { hovered = pointer = undefined; render() })
picker.on('click', ({ target, x, y }) => {
  pointer = { x, y }
  if (!target) source = undefined
  else if (target.kind === 'outlet') source = source === target ? undefined : target
  else if (source) {
    if (source.node === target.node) {
      updateStatus('Choose an inlet on a different node.')
      return
    }
    const from = source
    if (!connections.some(connection => connection.from === from && connection.to === target)) connections.push({ from, to: target })
    source = undefined
  }
  updateStatus()
})
canvas.addEventListener('keydown', event => {
  if (event.key === 'Escape') { source = undefined; updateStatus() }
})
clear.addEventListener('click', () => { source = undefined; connections.length = 0; updateStatus() })
dark.addEventListener('change', render)

new ResizeObserver(() => {
  if (!resizeFrame) resizeFrame = requestAnimationFrame(resize)
}).observe(canvas)
resize()
updateStatus()

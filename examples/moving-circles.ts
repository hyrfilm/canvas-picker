import { createPicker } from '../src/index.js'

const canvas = document.querySelector<HTMLCanvasElement>('#circle-field')!
const motion = document.querySelector<HTMLButtonElement>('#circle-motion')!
const ctx = canvas.getContext('2d')!
const picker = createPicker<Circle>(canvas, { canDrag: () => false })

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

const colours = [
  '#70a593', '#b0c9af', '#739bb2', '#af9bb9', '#cc8779', '#d8b67c', '#8caaa8',
  '#9cc5af', '#cbd8b7', '#a2bbd1', '#ccb9d3', '#e0aa9b', '#ebcf9e', '#b2c7c4',
  '#629382', '#9bac86', '#6185a5', '#9783ab', '#b87569', '#c39e62', '#749390',
  '#467864', '#788c64', '#476783', '#79658b', '#9f5d57', '#a7834c', '#577977',
  '#9c6e63', '#9c8363', '#9c9863', '#819c63', '#639c70', '#639c93', '#63879c',
  '#636b9c', '#84639c', '#9c6387', '#a78076', '#a79276', '#a7a476', '#90a776',
  '#76a781', '#76a79f', '#7695a7', '#767da7', '#9376a7', '#a77695', '#b39189',
  '#b3a189', '#b3b089', '#9fb389', '#89b393', '#89b3ac', '#89a4b3', '#898fb3',
  '#a189b3', '#b389a4', '#bfa29b', '#bfaf9b', '#bfbd9b', '#aebf9b', '#9bbfa3',
  '#9bbfb9', '#9bb2bf', '#9ba0bf', '#b09bbf', '#bf9bb2', '#cbb4ae', '#cbbeae',
  '#cbc9ae', '#bdcbae', '#aecbb5', '#aecbc6', '#aec0cb', '#aeb2cb', '#bfaecb',
]

type Circle = {
  hovered: boolean
  anchorX: number
  anchorY: number
  x: number
  y: number
  size: number
  phase: number
  speed: number
  ring: boolean
  colour: number
  path: Path2D
}

const makePath = (circle: Circle) => {
  circle.path = new Path2D()
  circle.path.arc(0, 0, circle.size * 4, 0, Math.PI * 2)
  return circle
}

const circles: Circle[] = Array.from({ length: 500 }, (_, i) => ({
  hovered: false,
  anchorX: Math.random(),
  anchorY: Math.random(),
  x: 0,
  y: 0,
  size: 1 + 28 * Math.random() ** 2.5,
  phase: Math.random() * Math.PI * 2,
  speed: .24 + Math.random() * .62,
  ring: i % 5 === 0,
  colour: i % colours.length,
  path: new Path2D(),
})).toSorted((a, b) => b.size - a.size).map(circle => ({ ...circle, speed: circle.speed * 2.0 / Math.min(circle.size, 1) })).map(makePath)

// Register each circle once; render() updates coordinates and calls invalidate().
for (const circle of circles) {
  picker.set(circle, target => {
    target.translate(circle.x, circle.y)
    if (circle.ring) {
      target.lineWidth = 5
      target.stroke(circle.path)
    } else {
      target.fill(circle.path)
    }
  })
}

let paused = reducedMotion.matches
let visible = true
let width = 1, height = 1
let time = 0, previous: number | undefined
let frame = 0
let resizeFrame = 0

function render(now: number) {
  frame = 0
  if (!paused && visible) {
    time += previous === undefined ? 0 : Math.min((now - previous) / 1000, .05)
    previous = now
    schedule()
  }

  ctx.clearRect(0, 0, width, height)
  for (const circle of circles) {
    const x = circle.anchorX * width + Math.sin(time * circle.speed + circle.phase) * 25
    const y = circle.anchorY * height + Math.cos(time * circle.speed * .76 + circle.phase) * 21
    circle.x = x
    circle.y = y

    ctx.translate(x, y)
    ctx.fillStyle = ctx.strokeStyle = colours[circle.colour]
    if (circle.hovered) {
      ctx.lineWidth = 2
      ctx.strokeStyle = '#f4f8e9'
      ctx.stroke(circle.path)
    }
    if (circle.ring) {
      ctx.lineWidth = 2
      ctx.stroke(circle.path)
    } else {
      ctx.fill(circle.path)
    }
    ctx.translate(-x, -y)
  }
  picker.invalidate()
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(render)
}

function applyResize() {
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
  schedule()
}

function scheduleResize() {
  if (!resizeFrame) resizeFrame = requestAnimationFrame(applyResize)
}

function updateMotion() {
  motion.textContent = paused ? 'Resume motion' : 'Pause motion'
  previous = undefined
  schedule()
}

motion.addEventListener('click', () => { paused = !paused; updateMotion() })
reducedMotion.addEventListener('change', () => { paused = reducedMotion.matches; updateMotion() })
picker.on('click', ({ target }) => {
  if (!target) return
  const offset = 1 + Math.floor(Math.random() * (colours.length - 1))
  target.colour = (target.colour + offset) % colours.length
  schedule()
})
picker.on('enter', ({ target }) => {
  if (target) target.hovered = true
  canvas.style.cursor = target ? 'pointer' : ''
  schedule()
})
picker.on('leave', ({ target }) => {
  if (target) target.hovered = false
  canvas.style.cursor = ''
  schedule()
})

new ResizeObserver(scheduleResize).observe(canvas)
new IntersectionObserver(([entry]) => {
  visible = entry.isIntersecting
  previous = undefined
  if (visible) schedule()
}).observe(canvas)

applyResize()
updateMotion()

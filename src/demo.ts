import { createIdPicker, createPicker, trackPointer } from './pick'
import { filled, stroked } from './shapes'

const TAU = Math.PI * 2
const showBuffer = document.querySelector<HTMLInputElement>('#show-buffer')!

type Point = { x: number; y: number }

function colors() {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    surface: token('--surface'),
    ink: token('--ink'),
    muted: token('--muted'),
    line: token('--line'),
    accent: token('--accent'),
    mark: token('--mark'),
    lilac: token('--lilac'),
    gold: token('--gold'),
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function circle(center: Point, radius: number) {
  const path = new Path2D()
  path.arc(center.x, center.y, radius, 0, TAU)
  return path
}

// --- Panel 1: Hilma field, drag a cable from an outlet to an inlet ---

function hilmaPanel() {
  // Everything is laid out in these fixed units; the canvas scales to its container.
  const W = 1000
  const H = 820
  const CX = 500
  const CY = 405
  const R = 286
  const N = 17
  const SEGMENTS = 14

  const sourceValues = ['envelope1.output', 'envelope2.output', 'lfo1.output', 'lfo2.output', 'lfo3.output', 'unassigned', 'unassigned', 'unassigned']
  const targetValues = ['step.pitch', 'step.duration', 'step.velocity', 'lfo1.speed', 'lfo1.amount', 'lfo2.amount', 'lfo2.speed', 'envelope1.amount']
  const allValues = [...new Set([...sourceValues, ...targetValues, 'Phase', 'Gate', 'Macro B', 'CC 1 / wheel', 'CC 74 / bright', 'Pressure'])]

  const canvas = document.querySelector<HTMLCanvasElement>('#field')!
  const status = document.querySelector('#field-status')!
  const out = document.querySelector('#field-out')!
  const menu = document.querySelector<HTMLElement>('#assign-menu')!
  const ctx = canvas.getContext('2d')!
  const ripple = !matchMedia('(prefers-reduced-motion: reduce)').matches

  const picker = createPicker(W, H)
  const ids = createIdPicker(picker)

  // The pick buffer is in layout units, pointer events are in CSS pixels.
  const toLayout = (x: number, y: number) => ({
    x: (x * W) / canvas.clientWidth,
    y: (y * H) / canvas.clientHeight,
  })
  const pick = (x: number, y: number) => {
    const p = toLayout(x, y)
    return ids.pick(p.x, p.y)
  }

  type Port = {
    id: string
    role: 'source' | 'destination'
    value: string
    patch: Point
    assign: Point
    inner: Point
    outer: Point
    label: Point
  }
  type Route = { from: Port; to: Port; path: Path2D }

  // Static geometry, keyed by pick id, and what each pick id belongs to.
  const patchPaths = new Map<string, Path2D>()
  const assignPaths = new Map<string, Path2D>()
  const dropPaths = new Map<string, Path2D>()
  const patchOf = new Map<string, Port>()
  const assignOf = new Map<string, Port>()
  const dropOf = new Map<string, Port>()
  const ports: Port[] = []
  const routes = new Map<string, Route>()

  const angleOf = (index: number) => -Math.PI / 2 + (index * TAU) / N
  const at = (angle: number, distance: number) => ({
    x: CX + Math.cos(angle) * distance,
    y: CY + Math.sin(angle) * distance,
  })

  const frame = new Path2D()
  for (let i = 0; i < N; i++) {
    const p = at(angleOf(i), R)
    frame.lineTo(p.x, p.y)
  }
  frame.closePath()

  const axisTop = at(angleOf(0), R)
  const axisOuter = at(angleOf(0), R + 18)
  const axisPath = circle(axisOuter, 5)

  function createPort(index: number, role: Port['role'], id: string, value: string) {
    const angle = angleOf(index)
    const side = role === 'source' ? -10 : 10
    const tx = Math.cos(angle + Math.PI / 2) * side
    const ty = Math.sin(angle + Math.PI / 2) * side
    const inner = at(angle, R - 20)
    const outer = at(angle, R + 18)
    const port: Port = {
      id,
      role,
      value,
      inner,
      outer,
      label: at(angle, R + 52),
      patch: { x: inner.x + tx, y: inner.y + ty },
      assign: { x: outer.x + tx, y: outer.y + ty },
    }
    ports.push(port)

    patchPaths.set(`${id}/patch`, circle(port.patch, 5.9))
    patchOf.set(`${id}/patch`, port)
    assignPaths.set(`${id}/assign`, circle(port.assign, 5.2))
    assignOf.set(`${id}/assign`, port)

    // An inlet accepts a cable released anywhere within 24 units of it.
    if (role === 'destination') {
      dropPaths.set(`${id}/drop`, circle(port.patch, 24))
      dropOf.set(`${id}/drop`, port)
      dropOf.set(`${id}/patch`, port)
    }
  }

  for (let i = 1; i <= 8; i++) createPort(i, 'destination', `inlet-${i}`, targetValues[i - 1])
  for (let i = 9; i <= 16; i++) createPort(i, 'source', `outlet-${i - 8}`, sourceValues[i - 9])

  // --- Cable shape ---

  // A cable hangs lower the longer it is.
  function sag(a: Point, b: Point) {
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    return Math.min((length * length) / 3500, 100)
  }

  // The point a fraction t along a cable hanging from a to b.
  function cablePoint(a: Point, b: Point, t: number) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t + 4 * t * (1 - t) * sag(a, b),
    }
  }

  // A cable at rest. Same shape as cablePoint, as one quadratic curve.
  function routePath(a: Point, b: Point) {
    const path = new Path2D()
    path.moveTo(a.x, a.y)
    path.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + 2 * sag(a, b), b.x, b.y)
    return path
  }

  // --- Picking ---

  // The only picking code in this panel. Later ids sit on top of earlier ones:
  // routes at the bottom, then the inlets' drop zones, then the ports.
  function register() {
    ids.clear()
    for (const [id, route] of routes) ids.set(id, stroked(route.path, 25))
    for (const [id, path] of dropPaths) ids.set(id, filled(path))
    for (const [id, path] of patchPaths) ids.set(id, filled(path, 4.5))
    for (const [id, path] of assignPaths) ids.set(id, filled(path, 4.5))
    ids.set('axis', filled(axisPath, 4.5))
  }

  // --- State and interaction ---

  let hovered: string | undefined
  let selectedPort: Port | undefined
  let selectedRoute: string | undefined
  let drag: { port: Port; start: Point; moved: boolean } | undefined
  let pointer: Point = { x: 0, y: 0 }
  let trail: Point[] = []
  let routeCount = 0

  const say = (text: string) => (status.textContent = text)

  function addRoute(from: Port, to: Port) {
    const id = `route-${++routeCount}`
    routes.set(id, { from, to, path: routePath(from.patch, to.patch) })
    register()
    return id
  }

  function trackPosition(e: PointerEvent) {
    pointer = toLayout(e.offsetX, e.offsetY)
    if (drag && Math.hypot(pointer.x - drag.start.x, pointer.y - drag.start.y) > 5) drag.moved = true
  }
  canvas.addEventListener('pointerdown', trackPosition)
  canvas.addEventListener('pointermove', trackPosition)

  trackPointer(canvas, pick, (type, id, e) => {
    if (type === 'enter') hovered = id
    if (type === 'down') down(id ?? '', e)
    if (type === 'up') up(id ?? '')
  })

  function down(id: string, e: MouseEvent) {
    menu.hidden = true
    const patch = patchOf.get(id)
    const assign = assignOf.get(id)
    const route = routes.get(id)

    if (patch?.role === 'source') {
      selectedPort = patch
      drag = { port: patch, start: pointer, moved: false }
      trail = []
      say(`drag ${patch.value} to a gold inlet`)
    } else if (patch) {
      say('drop a lilac outlet here')
    } else if (assign) {
      openMenu(assign, e)
    } else if (id === 'axis') {
      say(`${routes.size} routes / field axis`)
    } else if (route) {
      selectedPort = undefined
      selectedRoute = id
      say(`${route.from.value} → ${route.to.value}`)
    } else {
      selectedPort = undefined
      selectedRoute = undefined
    }
  }

  function up(id: string) {
    if (!drag) return
    const { port, moved } = drag
    const target = dropOf.get(id)
    drag = undefined
    selectedPort = undefined

    if (!moved) {
      say('drag a lilac inner port to patch')
    } else if (!target) {
      say('route cancelled')
    } else {
      selectedRoute = addRoute(port, target)
      say(`${port.value} → ${target.value}`)
    }
  }

  function openMenu(port: Port, e: MouseEvent) {
    selectedPort = port
    menu.replaceChildren()
    menu.style.left = `${clamp(e.clientX + 12, 14, innerWidth - 290)}px`
    menu.style.top = `${clamp(e.clientY + 12, 14, innerHeight - 410)}px`

    const title = document.createElement('div')
    title.className = 'menu-title'
    title.textContent = `${port.role} / assign`
    menu.append(title)

    const list = document.createElement('div')
    list.className = 'choices'
    for (const value of allValues) {
      const button = document.createElement('button')
      button.className = value === port.value ? 'choice current' : 'choice'
      button.textContent = value
      button.onclick = () => {
        port.value = value
        menu.hidden = true
        selectedPort = undefined
        say(`${port.role}: ${value}`)
      }
      list.append(button)
    }
    menu.append(list)
    menu.hidden = false
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas && !menu.contains(e.target as Node)) menu.hidden = true
  })

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRoute) {
      routes.delete(selectedRoute)
      selectedRoute = undefined
      register()
      say('route removed')
    }
  })

  document.querySelector<HTMLButtonElement>('#clear-routes')!.onclick = () => {
    routes.clear()
    selectedRoute = undefined
    register()
    say('routes cleared')
  }

  // --- Rendering ---

  // Keeps the backing store at device resolution and maps layout units onto it.
  function fit() {
    const width = Math.round(canvas.clientWidth * devicePixelRatio)
    const height = Math.round(canvas.clientHeight * devicePixelRatio)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    ctx.setTransform(width / W, 0, 0, height / H, 0, 0)
  }

  // The cable being dragged, as SEGMENTS pieces. Each piece aims at where the
  // pointer was one frame earlier than the piece after it, so a quick movement
  // travels down the cable from the hand to the outlet.
  function drawCable(from: Point) {
    trail.unshift(pointer)
    trail.length = Math.min(trail.length, SEGMENTS + 1)

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    let previous = from
    for (let i = 1; i <= SEGMENTS; i++) {
      const end = trail[ripple ? Math.min(SEGMENTS - i, trail.length - 1) : 0]
      const p = cablePoint(from, end, i / SEGMENTS)
      ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + p.x) / 2, (previous.y + p.y) / 2)
      previous = p
    }
    ctx.lineTo(previous.x, previous.y)
    ctx.stroke()
  }

  function render() {
    const c = colors()
    const hoveredPort = patchOf.get(hovered ?? '') ?? assignOf.get(hovered ?? '')
    const dropTarget = drag?.moved ? dropOf.get(hovered ?? '') : undefined

    fit()
    ctx.clearRect(0, 0, W, H)
    ctx.lineCap = 'round'
    ctx.textAlign = 'center'

    // Base
    ctx.strokeStyle = c.line
    ctx.lineWidth = 1.25
    ctx.stroke(frame)
    ctx.lineWidth = 1
    ctx.stroke(circle({ x: CX, y: CY }, 126))
    ctx.font = '8px "IBM Plex Mono", monospace'
    ctx.fillStyle = c.muted
    ctx.fillText('HILMA', CX, CY - 4)

    // Routes
    ctx.strokeStyle = c.lilac
    for (const [id, route] of routes) {
      const active = id === selectedRoute || id === hovered
      ctx.lineWidth = id === selectedRoute ? 3.3 : 1.8
      ctx.globalAlpha = active ? 1 : 0.65
      ctx.stroke(route.path)
    }
    ctx.globalAlpha = 1

    if (drag?.moved) {
      ctx.lineWidth = 2
      drawCable(drag.port.patch)
    }

    // Axis
    ctx.fillStyle = c.surface
    ctx.strokeStyle = c.muted
    ctx.lineWidth = 1.3
    for (const path of [circle(axisTop, 7), axisPath]) {
      ctx.fill(path)
      ctx.stroke(path)
    }

    // Ports
    for (const port of ports) {
      ctx.strokeStyle = c.line
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(port.inner.x, port.inner.y)
      ctx.lineTo(port.outer.x, port.outer.y)
      ctx.stroke()

      ctx.font = '500 10px "IBM Plex Sans", sans-serif'
      ctx.fillStyle = c.ink
      ctx.fillText(port.value, port.label.x, port.label.y - 3)
      ctx.font = '8px "IBM Plex Mono", monospace'
      ctx.fillStyle = port.role === 'source' ? c.lilac : c.gold
      ctx.fillText(port.role === 'source' ? 'OUT' : 'IN', port.label.x, port.label.y + 10)
    }

    for (const [id, path] of patchPaths) {
      const port = patchOf.get(id)!
      ctx.fillStyle = port.role === 'source' ? c.lilac : c.surface
      ctx.strokeStyle = port.role === 'source' ? c.surface : c.gold
      ctx.lineWidth = port.role === 'source' ? 1.15 : 1.8
      ctx.fill(path)
      ctx.stroke(path)
      if (port === dropTarget) {
        ctx.lineWidth = 1.5
        ctx.stroke(circle(port.patch, 11))
      }
    }

    for (const [id, path] of assignPaths) {
      const port = assignOf.get(id)!
      const active = port === selectedPort || port === hoveredPort
      if (port.role === 'source') {
        ctx.globalAlpha = active ? 1 : 0.5
        ctx.fillStyle = c.lilac
        ctx.fill(path)
      } else {
        ctx.globalAlpha = active ? 1 : 0.72
        ctx.fillStyle = c.surface
        ctx.strokeStyle = c.gold
        ctx.lineWidth = active ? 2.5 : 1.5
        ctx.fill(path)
        ctx.stroke(path)
      }
      ctx.globalAlpha = 1
    }

    if (showBuffer.checked) {
      ids.pick(0, 0) // forces the lazy redraw
      ctx.globalAlpha = 0.85
      ctx.drawImage(picker.ctx.canvas, 0, 0)
      ctx.globalAlpha = 1
    }

    const source = patchOf.get(hovered ?? '')?.role === 'source'
    canvas.style.cursor = drag ? 'grabbing' : source ? 'grab' : hoveredPort || routes.has(hovered ?? '') ? 'pointer' : 'default'
    out.textContent = `hover: ${hovered ?? '–'}   selected: ${selectedRoute ?? '–'}   routes: ${routes.size}`
    requestAnimationFrame(render)
  }

  addRoute(ports[8], ports[0])
  addRoute(ports[10], ports[2])
  addRoute(ports[11], ports[3])
  render()
}

// --- Panel 2: ADSR envelope, drag points and bend curves ---

function envelopePanel() {
  const W = 420
  const H = 240
  const PAD = 20

  const canvas = document.querySelector<HTMLCanvasElement>('#envelope')!
  const out = document.querySelector('#envelope-out')!
  const ctx = canvas.getContext('2d')!
  canvas.width = W * devicePixelRatio
  canvas.height = H * devicePixelRatio
  canvas.style.width = W + 'px'
  canvas.style.height = H + 'px'
  ctx.scale(devicePixelRatio, devicePixelRatio)

  const picker = createPicker(W, H)
  const ids = createIdPicker(picker)

  const points = [
    { id: 'start', x: PAD, y: H - PAD },
    { id: 'peak', x: 90, y: 30 },
    { id: 'sustain-in', x: 170, y: 110 },
    { id: 'sustain-out', x: 300, y: 110 },
    { id: 'end', x: W - PAD, y: H - PAD },
  ]

  // Segment i runs from points[i] to points[i + 1]. bend is -1..1, 0 is straight.
  const segments = [
    { id: 'attack', bend: 0.6 },
    { id: 'decay', bend: 0.6 },
    { id: 'sustain', bend: 0 },
    { id: 'release', bend: 0.6 },
  ]

  const segmentPaths = new Map<string, Path2D>()
  const pointPaths = new Map<string, Path2D>()

  // Geometry only: one path per id. Called on every drag step.
  function buildPaths() {
    segments.forEach((segment, i) => {
      const a = points[i]
      const b = points[i + 1]
      const path = new Path2D()
      path.moveTo(a.x, a.y)
      path.quadraticCurveTo(
        (a.x + b.x) / 2 - (segment.bend * (b.x - a.x)) / 2,
        (a.y + b.y) / 2 + (segment.bend * (b.y - a.y)) / 2,
        b.x,
        b.y,
      )
      segmentPaths.set(segment.id, path)
    })

    for (const point of points) pointPaths.set(point.id, circle(point, 5))
  }

  // The only picking code in this panel. Points are registered last so they
  // sit on top of the curves that end in them. The pick buffer itself is
  // only redrawn on the next pick.
  function register() {
    ids.clear()
    for (const [id, path] of segmentPaths) ids.set(id, stroked(path, 14))
    for (const [id, path] of pointPaths) ids.set(id, filled(path, 4))
  }

  let hovered: string | undefined
  let dragging: string | undefined
  let lastY = 0

  // Registered before trackPointer, so its hover pick during a drag sees the
  // geometry this drag step just built.
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const point = points.find((p) => p.id === dragging)
    if (point) movePoint(point, e.offsetX, e.offsetY)
    else bendSegment(dragging, e.offsetY - lastY)
    lastY = e.offsetY
    buildPaths()
    register()
  })

  trackPointer(canvas, ids.pick, (type, id, e) => {
    if (type === 'enter') hovered = id
    if (type === 'up') dragging = undefined
    if (type === 'down') {
      dragging = id
      lastY = e.offsetY
    }
  })

  function movePoint(point: (typeof points)[number], x: number, y: number) {
    const i = points.indexOf(point)
    const last = points.length - 1
    if (i === 0) return
    point.x = clamp(x, points[i - 1].x + 10, i === last ? W - PAD : points[i + 1].x - 10)
    if (i === last) return
    point.y = clamp(y, PAD, H - PAD)
    // The two sustain points share a level.
    if (i === 2 || i === 3) points[2].y = points[3].y = point.y
  }

  function bendSegment(id: string, dy: number) {
    const i = segments.findIndex((s) => s.id === id)
    const direction = Math.sign(points[i + 1].y - points[i].y)
    segments[i].bend = clamp(segments[i].bend + (dy / 60) * direction, -1, 1)
  }

  function render() {
    const c = colors()
    const active = dragging ?? hovered
    ctx.clearRect(0, 0, W, H)

    ctx.lineWidth = 1
    ctx.strokeStyle = c.line
    ctx.beginPath()
    ctx.moveTo(PAD, H - PAD)
    ctx.lineTo(W - PAD, H - PAD)
    ctx.moveTo(PAD, PAD)
    ctx.lineTo(W - PAD, PAD)
    ctx.stroke()

    ctx.font = '11px "IBM Plex Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    segments.forEach((segment, i) => {
      ctx.fillStyle = segment.id === active ? c.accent : c.muted
      ctx.fillText(segment.id[0].toUpperCase(), (points[i].x + points[i + 1].x) / 2, H - 8)
    })

    for (const [id, path] of segmentPaths) {
      ctx.lineWidth = id === active ? 3 : 2
      ctx.strokeStyle = id === dragging ? c.mark : id === active ? c.accent : c.ink
      ctx.stroke(path)
    }

    for (const [id, path] of pointPaths) {
      ctx.fillStyle = id === dragging ? c.mark : id === active ? c.accent : c.surface
      ctx.fill(path)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = c.ink
      ctx.stroke(path)
    }

    if (showBuffer.checked) {
      ids.pick(0, 0) // forces the lazy redraw
      ctx.globalAlpha = 0.85
      ctx.drawImage(picker.ctx.canvas, 0, 0)
      ctx.globalAlpha = 1
    }

    canvas.style.cursor = dragging ? 'grabbing' : hovered ? 'grab' : 'default'
    out.textContent = `hover: ${hovered ?? '–'}   dragging: ${dragging ?? '–'}`
    requestAnimationFrame(render)
  }

  buildPaths()
  register()
  render()
}

hilmaPanel()
envelopePanel()

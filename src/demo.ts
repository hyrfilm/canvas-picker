import { createPicker, filled, stroked } from './index.js'

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
  type Route = { kind: 'route'; id: string; from: Port; to: Port; path: Path2D }
  type Control = { kind: 'patch' | 'assign' | 'drop'; port: Port; path: Path2D }
  type Target = Route | Control | 'axis'
  const ids = createPicker<Target>(canvas, { width: W, height: H })
  const patches: Control[] = []
  const assignments: Control[] = []
  const drops: Control[] = []
  const ports: Port[] = []
  const routes = new Set<Route>()

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

    patches.push({ kind: 'patch', port, path: circle(port.patch, 5.9) })
    assignments.push({ kind: 'assign', port, path: circle(port.assign, 5.2) })
    if (role === 'destination') drops.push({ kind: 'drop', port, path: circle(port.patch, 24) })
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
    for (const route of routes) ids.set(route, stroked(route.path, 25))
    for (const drop of drops) ids.set(drop, filled(drop.path))
    for (const control of [...patches, ...assignments]) ids.set(control, filled(control.path, 4.5))
    ids.set('axis', filled(axisPath, 4.5))
  }

  // --- State and interaction ---

  let hovered: Target | undefined
  let selectedPort: Port | undefined
  let selectedRoute: Route | undefined
  let drag: Port | undefined
  let pointer: Point = { x: 0, y: 0 }
  let trail: Point[] = []
  let routeCount = 0

  const say = (text: string) => (status.textContent = text)

  function addRoute(from: Port, to: Port) {
    const id = `route-${++routeCount}`
    const route: Route = { kind: 'route', id, from, to, path: routePath(from.patch, to.patch) }
    routes.add(route)
    register()
    return route
  }

  ids.track(e => {
    if (e.type === 'enter') hovered = e.target
    if (e.type === 'leave') hovered = undefined
    if (e.type === 'down') down(e.target, e.event)
    if (e.type === 'dragstart' && e.target !== 'axis' && e.target.kind === 'patch' && e.target.port.role === 'source') {
      drag = e.target.port
      selectedPort = drag
      trail = []
    }
    if (e.type === 'drag') pointer = { x: e.x, y: e.y }
    if (e.type === 'up') up(e.target)
    if (e.type === 'dragcancel') up(undefined)
  })

  function down(target: Target | undefined, e: PointerEvent) {
    menu.hidden = true
    const control = target === 'axis' ? undefined : target
    const patch = control?.kind === 'patch' ? control.port : undefined
    const assign = control?.kind === 'assign' ? control.port : undefined

    if (patch && patch.role === 'source') {
      say(`drag ${patch.value} to a gold inlet`)
    } else if (patch) {
      say('drop a lilac outlet here')
    } else if (assign) {
      openMenu(assign, e)
    } else if (target === 'axis') {
      say(`${routes.size} routes / field axis`)
    } else if (control?.kind === 'route') {
      selectedPort = undefined
      selectedRoute = control
      say(`${control.from.value} → ${control.to.value}`)
    } else {
      selectedPort = undefined
      selectedRoute = undefined
    }
  }

  function inlet(target: Target | undefined) {
    if (target && target !== 'axis' && (target.kind === 'drop' || target.kind === 'patch') && target.port.role === 'destination') return target.port
  }

  function up(id: Target | undefined) {
    if (!drag) return
    const port = drag
    const target = inlet(id)
    drag = undefined
    selectedPort = undefined

    if (!target) {
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
    const control = hovered === 'axis' ? undefined : hovered
    const hoveredPort = control?.kind === 'assign' || control?.kind === 'patch' ? control.port : undefined
    const dropTarget = drag ? inlet(hovered) : undefined

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
    for (const route of routes) {
      const active = route === selectedRoute || route === hovered
      ctx.lineWidth = route === selectedRoute ? 3.3 : 1.8
      ctx.globalAlpha = active ? 1 : 0.65
      ctx.stroke(route.path)
    }
    ctx.globalAlpha = 1

    if (drag) {
      ctx.lineWidth = 2
      drawCable(drag.patch)
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

    for (const { port, path } of patches) {
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

    for (const { port, path } of assignments) {
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
      ctx.globalAlpha = 0.85
      ids.drawBuffer(ctx)
      ctx.globalAlpha = 1
    }

    const source = control?.kind === 'patch' && control.port.role === 'source'
    canvas.style.cursor = drag ? 'grabbing' : source ? 'grab' : hoveredPort || control?.kind === 'route' ? 'pointer' : 'default'
    const label = control?.kind === 'route' ? control.id : control ? `${control.port.id}/${control.kind}` : hovered
    out.textContent = `hover: ${label ?? '–'}   selected: ${selectedRoute?.id ?? '–'}   routes: ${routes.size}`
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

  type Handle = typeof points[number] | typeof segments[number]
  const ids = createPicker<Handle>(canvas, { width: W, height: H })
  const segmentPaths = new Map<typeof segments[number], Path2D>()
  const pointPaths = new Map<typeof points[number], Path2D>()

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
      segmentPaths.set(segment, path)
    })

    for (const point of points) pointPaths.set(point, circle(point, 5))
  }

  // The only picking code in this panel. Points are registered last so they
  // sit on top of the curves that end in them. The pick buffer itself is
  // only redrawn on the next pick.
  function register() {
    for (const [id, path] of segmentPaths) ids.set(id, stroked(path, 14))
    for (const [id, path] of pointPaths) ids.set(id, filled(path, 4))
  }

  let hovered: Handle | undefined
  let dragging: Handle | undefined
  let lastY = 0

  ids.track(e => {
    if (e.type === 'enter') hovered = e.target
    if (e.type === 'leave') hovered = undefined
    if (e.type === 'dragstart') {
      dragging = e.target
      lastY = e.startY
    }
    if (e.type === 'dragend' || e.type === 'dragcancel') dragging = undefined
    if (e.type === 'drag') {
      if ('x' in e.target) movePoint(e.target, e.x, e.y)
      else bendSegment(e.target, e.y - lastY)
      lastY = e.y
      buildPaths()
      register()
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

  function bendSegment(segment: typeof segments[number], dy: number) {
    const i = segments.indexOf(segment)
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
      ctx.fillStyle = segment === active ? c.accent : c.muted
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
      ctx.globalAlpha = 0.85
      ids.drawBuffer(ctx)
      ctx.globalAlpha = 1
    }

    canvas.style.cursor = dragging ? 'grabbing' : hovered ? 'grab' : 'default'
    out.textContent = `hover: ${hovered?.id ?? '–'}   dragging: ${dragging?.id ?? '–'}`
    requestAnimationFrame(render)
  }

  buildPaths()
  register()
  render()
}

hilmaPanel()
envelopePanel()

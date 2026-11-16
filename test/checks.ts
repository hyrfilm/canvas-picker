import { createIdPicker, createPicker } from '../src/pick'
import { stroked } from '../src/shapes'
import { rect, collisionScene, circleScene, thinScene, loadScene, scanScene } from './scenarios'

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
}

const checks: { name: string; run: () => void | ReturnType<typeof scanScene> }[] = [
  {
    name: 'Empty and whitespace-only IDs are rejected',
    run() {
      const ids = createIdPicker(createPicker(8, 8))
      for (const id of ['', ' ', '\t\n']) {
        let rejected = false
        try { ids.set(id, rect(0, 0, 4, 4)) } catch { rejected = true }
        equal(rejected, true)
      }
      ids.set(' a ', rect(0, 0, 4, 4))
      equal(ids.pick(2, 2), ' a ')
    },
  },
  {
    name: 'Checking a wide stroke does not change later checks',
    run() {
      const scene = collisionScene()
      const narrow = new Path2D()
      narrow.moveTo(2, 20.5); narrow.lineTo(14, 20.5)
      scene.shapes[10].draw = ctx => ctx.stroke(narrow)
      const broad = new Path2D()
      broad.moveTo(48, 0); broad.lineTo(48, 48)
      scene.shapes.push({ id: 'wide-stroke', draw: stroked(broad, 25) })
      const { ids } = loadScene(scene)
      equal(ids.pick(8, 10), undefined)
      equal(ids.pick(48, 26), 'wide-stroke')
      equal(ids.pick(8, 10), undefined)
    },
  },
  {
    name: 'Each shape starts with an empty current path',
    run() {
      const ids = createIdPicker(createPicker(32, 16))
      ids.set('left', ctx => { ctx.rect(2, 2, 6, 6); ctx.fill() })
      ids.set('right', ctx => { ctx.rect(20, 2, 6, 6); ctx.fill() })
      equal(ids.pick(4, 4), 'left')
      equal(ids.pick(22, 4), 'right')
      equal(ids.pick(4, 4), 'left')
    },
  },
  {
    name: 'Local drawing transforms do not affect the next shape',
    run() {
      const ids = createIdPicker(createPicker(32, 16))
      ids.set('right', ctx => { ctx.translate(20, 0); ctx.fillRect(0, 2, 6, 6) })
      ids.set('left', rect(2, 2, 6, 6))
      equal(ids.pick(4, 4), 'left')
      equal(ids.pick(22, 4), 'right')
    },
  },
  {
    name: 'A throwing shape restores drawing state',
    run() {
      const picker = createPicker(16, 16)
      try { picker.draw(1, ctx => { ctx.lineWidth = 20; throw new Error('stop') }) } catch {}
      equal(picker.ctx.lineWidth, 1)
      try { picker.coverage(ctx => { ctx.lineWidth = 20; throw new Error('stop') }, 4, 4) } catch {}
      const path = new Path2D()
      path.moveTo(0, 8.5); path.lineTo(16, 8.5)
      equal(picker.coverage(ctx => ctx.stroke(path), 4, 3), 0)
    },
  },
  {
    name: 'Shapes supply their own drawing settings',
    run() {
      const picker = createPicker(64, 48)
      const path = new Path2D()
      path.moveTo(2, 8.5); path.lineTo(30, 8.5)
      const ids = createIdPicker(picker)
      ids.set('stroke', ctx => { ctx.lineWidth = 10; ctx.stroke(path) })
      equal(ids.pick(8, 5), 'stroke')
      equal(picker.ctx.lineWidth, 1)
    },
  },
  {
    name: 'Verification rejects the known distant-object collision',
    run() {
      const scene = collisionScene()
      equal(loadScene(scene, { verify: false, neighbours: 0 }).ids.pick(8, 10), 'shape-11')
      equal(loadScene(scene).ids.pick(8, 10), undefined)
      equal(loadScene(scene).ids.pick(12, 10), 'shape-16')
    },
  },
  {
    name: 'Two matching neighbours remain a heuristic',
    run() {
      equal(loadScene(collisionScene(), { verify: false, neighbours: 2 }).ids.pick(8, 10), 'shape-11')
      equal(loadScene(collisionScene(), { verify: false, neighbours: 8 }).ids.pick(8, 10), undefined)
    },
  },
  {
    name: 'Thin targets work without a solid 3×3 area',
    run() {
      const scene = thinScene()
      const { ids } = loadScene(scene)
      equal(ids.pick(12.9, 8.1), 'one-pixel-dot')
      equal(ids.pick(30, 24), 'one-pixel-line')
      equal(loadScene(scene, { neighbours: 8 }).ids.pick(30, 24), undefined)
    },
  },
  {
    name: 'Changes, deletion, and invalidation redraw lazily',
    run() {
      const ids = createIdPicker(createPicker(32, 16))
      let x = 2
      ids.set('moving', ctx => ctx.fillRect(x, 2, 6, 6))
      equal(ids.pick(4, 4), 'moving')
      x = 20
      ids.invalidate()
      equal(ids.pick(4, 4), undefined)
      equal(ids.pick(22, 4), 'moving')
      ids.delete('moving')
      equal(ids.pick(22, 4), undefined)
      ids.set('other', rect(2, 2, 6, 6))
      ids.clear()
      equal(ids.pick(4, 4), undefined)
    },
  },
  {
    name: 'The probe follows buffer transforms and handles its boundary',
    run() {
      const picker = createPicker(32, 32)
      picker.ctx.setTransform(2, 0, 0, 3, 10, 11)
      const ids = createIdPicker(picker)
      ids.set('box', rect(0, 0, 4, 4))
      equal(ids.pick(13, 15), 'box')
      equal(ids.pick(3, 3), undefined)
      equal(ids.pick(-1, 0), undefined)
      const background = createIdPicker(createPicker(8, 8))
      background.set('background', rect(0, 0, 8, 8))
      equal(background.pick(0, 0), 'background')
    },
  },
  {
    name: 'Seeded overlapping paths never return an absent shape',
    run() {
      const scene = circleScene()
      const result = scanScene(scene)
      equal(result.unrelated, 0)
      return result
    },
  },
  {
    name: 'Rotated and scaled paths never return an absent shape',
    run() {
      const scene = circleScene(80, 120, 100)
      scene.transform = new DOMMatrix().translate(15.25, 9.75).rotate(17).scale(0.72, 0.58)
      const result = scanScene(scene)
      equal(result.unrelated, 0)
      return result
    },
  },
]

export { checks }

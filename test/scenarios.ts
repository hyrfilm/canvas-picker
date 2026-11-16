import { createIdPicker, createPicker, type Shape } from '../src/pick'
import { filled, stroked } from '../src/shapes'

type Scene = {
  width: number
  height: number
  shapes: { id: string; draw: Shape }[]
  transform?: DOMMatrix
}

const rect = (x: number, y: number, width: number, height: number): Shape =>
  ctx => ctx.fillRect(x, y, width, height)

function collisionScene(): Scene {
  return {
    width: 64,
    height: 48,
    shapes: Array.from({ length: 16 }, (_, i) => ({
      id: `shape-${i + 1}`,
      draw: i === 5 ? rect(0, 0, 20, 20)
        : i === 15 ? rect(8.4921875, 0, 12, 20)
        : rect(26, 26, 2, 2),
    })),
  }
}

function circleScene(count = 300, width = 192, height = 144): Scene {
  let seed = 0x12345678
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  return {
    width, height,
    shapes: Array.from({ length: count }, (_, i) => {
      const path = new Path2D()
      path.arc(random() * width, random() * height, 2 + random() * 14, 0, Math.PI * 2)
      return {
        id: `circle-${i + 1}`,
        draw: i % 5 === 0 ? stroked(path, 1 + i % 7) : filled(path, i % 3 === 0 ? 2 : 0),
      }
    }),
  }
}

function thinScene(): Scene {
  const line = new Path2D()
  line.moveTo(4, 24.5)
  line.lineTo(60, 24.5)
  const curve = new Path2D()
  curve.moveTo(4, 42)
  curve.quadraticCurveTo(32, 28, 60, 42)
  return {
    width: 64, height: 48,
    shapes: [
      { id: 'one-pixel-dot', draw: rect(12, 8, 1, 1) },
      { id: 'one-pixel-line', draw: stroked(line, 1) },
      { id: 'curve', draw: stroked(curve, 6) },
    ],
  }
}

function loadScene(scene: Scene, options: Parameters<typeof createIdPicker>[1] = {}) {
  const picker = createPicker(scene.width, scene.height)
  if (scene.transform) picker.ctx.setTransform(scene.transform)
  const ids = createIdPicker(picker, options)
  for (const shape of scene.shapes) ids.set(shape.id, shape.draw)
  ids.pick(0, 0)
  return { picker, ids }
}

// Render each shape separately at full size. This reference is independent of
// the small verification buffer; it checks presence, not identical edge alpha.
function scanScene(scene: Scene, options: Parameters<typeof createIdPicker>[1] = {}) {
  const { ids } = loadScene(scene, options)
  const ctx = new OffscreenCanvas(scene.width, scene.height).getContext('2d', { willReadFrequently: true })!
  const coverage = new Map<string, Uint8ClampedArray>()
  for (const shape of scene.shapes) {
    ctx.reset()
    if (scene.transform) ctx.setTransform(scene.transform)
    shape.draw(ctx)
    coverage.set(shape.id, ctx.getImageData(0, 0, scene.width, scene.height).data)
  }
  let hits = 0, unrelated = 0
  for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
    const id = ids.pick(x, y)
    if (id !== undefined) {
      hits++
      if (coverage.get(id)![4 * (y * scene.width + x) + 3] === 0) unrelated++
    }
  }
  return { pixels: scene.width * scene.height, hits, unrelated }
}

export { rect, collisionScene, circleScene, thinScene, loadScene, scanScene }
export type { Scene }

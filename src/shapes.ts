// Optional pick shapes for Path2D geometry. pick.ts does not depend on this.

import type { Shape } from './pick'

// The inside of a closed path, grown outward by margin on every side.
export function filled(path: Path2D, margin = 0): Shape {
  return (ctx) => {
    ctx.fill(path)
    if (margin > 0) {
      ctx.lineWidth = margin * 2
      ctx.stroke(path)
    }
  }
}

// A line or curve, as a band of the given width centred on it.
export function stroked(path: Path2D, width: number): Shape {
  return (ctx) => {
    ctx.lineWidth = width
    ctx.stroke(path)
  }
}

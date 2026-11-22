import { createInternalIndexPicker, type Shape } from './color-index.js'

export { canvasPoint, type ClientPoint, type Point, type Size } from './coordinates.js'
export type { Shape }

export interface IndexPicker {
  readonly ctx: OffscreenCanvasRenderingContext2D
  clear(): void
  draw(index: number, shape: Shape): void
  pick(x: number, y: number, neighbours?: number): number
  coverage(shape: Shape, x: number, y: number): number
}

export function createIndexPicker(width: number, height: number): IndexPicker {
  const { ctx, clear, draw, pick, coverage } = createInternalIndexPicker(width, height)
  return { ctx, clear, draw, pick, coverage }
}

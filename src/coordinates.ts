export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export type ClientPoint = Pick<MouseEvent, 'clientX' | 'clientY'>

// Map a viewport pointer/mouse coordinate on `canvas` into buffer pixels.
// Handles borders, padding, content-box/border-box, fractional CSS sizes,
// positive axis-aligned CSS scaling, scrolling, and Retina DPR.
export function canvasPoint(canvas: HTMLCanvasElement, event: ClientPoint, size?: Size): Point
export function canvasPoint(canvas: HTMLCanvasElement, event: ClientPoint, width: number, height: number): Point
export function canvasPoint(
  canvas: HTMLCanvasElement,
  event: ClientPoint,
  widthOrSize?: number | Size,
  height?: number,
): Point {
  const width = typeof widthOrSize === 'number' ? widthOrSize : (widthOrSize?.width ?? canvas.width)
  const bufferHeight = typeof widthOrSize === 'number' ? height! : (widthOrSize?.height ?? canvas.height)
  const rect = canvas.getBoundingClientRect()
  if (!(rect.width > 0 && rect.height > 0)) return { x: NaN, y: NaN }
  const css = getComputedStyle(canvas)
  const left = parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft)
  const right = parseFloat(css.borderRightWidth) + parseFloat(css.paddingRight)
  const top = parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop)
  const bottom = parseFloat(css.borderBottomWidth) + parseFloat(css.paddingBottom)
  const borderBox = css.boxSizing === 'border-box'
  return {
    x: mapAxis(event.clientX, rect.left, rect.width, css.width, left, right, borderBox, width),
    y: mapAxis(event.clientY, rect.top, rect.height, css.height, top, bottom, borderBox, bufferHeight),
  }
}

function mapAxis(
  client: number,
  edge: number,
  displayed: number,
  size: string,
  before: number,
  after: number,
  borderBox: boolean,
  units: number,
) {
  const raw = parseFloat(size)
  const content = Number.isFinite(raw)
    ? raw - (borderBox ? before + after : 0)
    : displayed - before - after
  if (!(content > 0)) return NaN
  const local = (client - edge) * (content + before + after) / displayed
  return (local - before) * units / content
}

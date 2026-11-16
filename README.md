# canvas-picker

Hit testing for canvas 2D without geometry maths. Every pickable thing is drawn
into a hidden buffer in its own flat colour; to find what is under the pointer,
read a 3×3 neighbourhood of pixels. Anything canvas can draw is pickable:
SVG path data, curves, lines, text, odd polygons.

It suits content that changes on user events, not every frame. The buffer is
redrawn only on the first pick after something changed.

## Layers

Each layer works without the ones above it.

| | Does | Knows nothing about |
|---|---|---|
| `createPicker(width, height)` | Draws shapes by integer index, reads an index back at x,y | Ids, events |
| `createIdPicker(picker)` | String ids, redraws lazily | Events, what the shapes are |
| `trackPointer(el, pick, emit)` | Turns pointer events into `enter`, `leave`, `down`, `up`, `click` | Your emitter, your coordinates |

```ts
import { createIdPicker, createPicker, trackPointer } from './pick'
import { filled, stroked } from './shapes'

const ids = createIdPicker(createPicker(400, 300))

ids.set('wire', stroked(wirePath, 12))
ids.set('knob', filled(knobPath, 4))

trackPointer(canvas, ids.pick, (type, id, e) => {
  if (type === 'click' && id) store.select(id)
})
```

Empty space is a target like any other, with an undefined id. Every event
carries the id under the pointer or `undefined`, and moving off a shape emits
`leave` for it, then `enter` with `undefined`. To give empty space a name,
register a shape that covers the whole buffer first, under an id of your own.

`ids.set` and `ids.delete` mark the buffer as changed. Call `ids.invalidate()`
when geometry changed behind an id you already registered, and `ids.clear()`
before registering a new set. Later ids sit on top of earlier ones.

## Shapes

A shape is a function that draws into a context: `(ctx) => void`. It does
geometry only (paths, `fill()`, `stroke()`, `lineWidth`) and must not set
`fillStyle`, `strokeStyle` or `globalAlpha`. The picker sets the colour.

A pick shape does not have to match what you draw on screen. It is usually
fatter, so thin lines and small dots are easy to hit.

`shapes.ts` is an optional module with the two shapes every panel ends up
writing for `Path2D` geometry:

- `filled(path, margin)`: a closed path, grown outward by `margin`
- `stroked(path, width)`: a line or curve as a band of `width`

## Coordinates

The buffer has a fixed size and its own coordinate space. It never needs to
match the canvas on screen, and it never needs resizing: map the pointer into
the buffer's space and pick there.

```ts
const pick = (x: number, y: number) =>
  ids.pick((x * WIDTH) / canvas.clientWidth, (y * HEIGHT) / canvas.clientHeight)

trackPointer(canvas, pick, emit)
```

If the visible canvas pans or zooms, either map the pointer back the same way,
or set the same transform on `picker.ctx` and call `ids.invalidate()`.

## Limits

- **Only the topmost shape at a pixel is pickable.** When two things overlap
  and you need to ask about each separately, give them separate buffers. For
  example, drop zones in one id picker and everything clickable in another:
  hover and click ask the second, releasing a drag asks the first.
- **Picks need a solid 3×3 neighbourhood.** All nine pixels must be fully
  opaque and decode to the same index. Samples crossing a shape boundary or
  the buffer boundary return `undefined`, even if the centre pixel is inside
  a shape. Regions only one or two buffer pixels wide cannot be picked; give
  thin lines and small things a thicker pick shape.
- **Neighbour agreement reduces blended-colour false matches.** An antialiased
  edge over another shape can blend into an unrelated id. Requiring all nine
  pixels to agree rejects isolated matches and narrow bands of that colour.
  This is a heuristic; arbitrary geometry can still produce larger regions
  of matching blended colours.
- **About 262,000 ids per buffer.** The index uses six bits per colour
  channel. The remaining two bits absorb rounding where a shape's own fill and
  stroke overlap.
- **`drawImage` is not pickable.** It ignores the pick colour. Register a
  rectangle or an outline path for anything drawn as a bitmap.

## To do

- **Cleanup for `trackPointer`.** It adds five listeners and never removes
  them. It should return a function that does, for components that unmount.
- **Tests.** Picking needs browser tests (`OffscreenCanvas`). Cover solid
  interiors, rejection near boundaries, and thicker pick shapes made with
  `filled` and `stroked`. Include a straight antialiased edge over another
  shape whose blend decodes to an unrelated id. Also scan a few hundred
  overlapping circles, checking for ids belonging to circles nowhere near
  the sampled pixel.

## Not in the library

Dragging, drop targets, coordinate scaling and path building are left to the
app. `demo.ts` has a worked example of each.

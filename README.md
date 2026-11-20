# canvas-picker

Detects shapes on Canvas2d from x,y coordinates, mouse or touch events. Bind event listeners to shapes and pretend they're DOM-objects.

[examples & demos](https://hyrfilm.github.io/hyrfilm/canvas-picker)

## Installing

```sh
npm install canvas-picker
```

## About

This library mostly useful for applications like games, editors, or other applications where you use html5 canvas as part your user-interface. It implements a pretty basic "algorithm" (if it could be called that) called color-picking. TL;DR - you use an offscreen buffer where you render shapes in addition to the regular rendering of a scene. Each shape you want to be able to "pick out" with the mouse or whatever is given a unique color in such a
way that shapes can be uniquely identified.
This has several advantages: a single way of identifying arbitrarily complex shapes, like SVG-paths, or thin lines, multiple overlapping shapes etc. It usually is faster than analytical approaches as well, unless your shapes are very few and very simple.
Canvas-picker is a very small and simple library. It doesn't try to provide functionality for every possible use-case but does provide a range of modules, depending on your needs - from low-level (ie 'pixel at position') to where you can associate whatever objects, numbers, strings or whatever with your shape, add event listeners and, sort of treat them as they were DOM-objects. So, clicking, hovering, dragging - that sort of thing.

This example show how you could make similar to a dial/knob for panning controls where dragging along it would change its panning:
```ts
import { createPicker } from 'canvas-picker'

const knob = { x: 60, y: 80 }
const picker = createPicker<typeof knob>(canvas, { width: 400, height: 300 })
const origin = { ...knob }

picker.set(knob, ctx => {
  ctx.arc(knob.x, knob.y, 12, 0, Math.PI * 2)
  ctx.fill()
})

picker.on(knob, 'dragstart', () => Object.assign(origin, knob))
picker.on(knob, 'drag', e => {
  knob.x = origin.x + e.dx
  knob.y = origin.y + e.dy
  picker.invalidate()
  draw() // Your visible canvas reads knob.x and knob.y.
})
picker.on(knob, 'click', () => select(knob))
// When the component unmounts, call picker.dispose().
```

## Events

Use `picker.on(target, type, handler)` for a widget, `picker.on(type, handler)` across the canvas, or `picker.track(handler)` to send the entire event stream to a state machine. Each returns an unsubscribe function. They share one gesture tracker. Deleting a target removes its scoped handlers, and `clear()` removes all targets and their scoped handlers.

Bind empty-space input with `picker.on(undefined, 'click', handler)`. This subscription survives `clear()`. Call `dispose()` on unmount to cancel an active drag, release pointer capture, remove all handlers, and clear the shapes. Create a fresh picker on remount.

| Event | Target and position |
| --- | --- |
| `enter`, `leave` | The target entered or left, including empty space. |
| `move`, `down`, `up`, `click` | The hit at the current position. A moving shape can cover its drop destination. See the drop example below. |
| `dragstart`, `drag`, `dragend`, `dragcancel` | The target pressed initially. `startX` and `startY` give the press position. `dx` and `dy` are cumulative from that position. |

Every event includes `x`, `y`, and the underlying DOM pointer event in `event`. A primary-button drag starts after five CSS pixels of movement by default. Set `dragThreshold` to tune it. Supply `canDrag(target, event)` to decide at press time which targets can start a drag. A declined target still receives ordinary pointer and click events. Drag callbacks run before hover picking on a move so updated geometry participates immediately. Use `touch-action: none` on a draggable canvas to reserve touch gestures for the widget. Pointer cancellation, lost capture, and window blur cancel an active drag.

## Shapes and coordinates

- `createPicker(canvas)` takes its initial buffer size from the canvas attributes. Pass `{ width, height }` to choose a fixed logical resolution. To use picking without DOM input, call `createPicker({ width, height })`. This library uses browser Canvas 2D, `OffscreenCanvas`, and `DOMMatrix`.
- `set(target, shape)` register hit shapes in the same back-to-front order your app uses to draw them. You can register them in a separate pass or as you draw. Updating an existing target’s geometry keeps its original position in that order.
- `filled(path, margin?)` and `stroked(path, width)` create pick shapes from a `Path2D`. A custom shape receives a context with colour and opacity already set. The picker begins a fresh path for each call and saves and restores context state around it. Shapes may run again during hit verification, so keep drawing callbacks free of application state changes.
- `pick(x, y)` accepts coordinates in the space where shapes draw. `setTransform(matrix)` sets the invertible 2D transform from that space to buffer pixels. Pointer positions and drag deltas use shape units.
- `invalidate()` marks geometry stale after a model changes. The next pick or `drawBuffer(ctx)` redraws it. `drawBuffer` paints the current pick buffer at the destination context’s origin, respecting its transform.
- `resize(width, height)` changes the pick buffer resolution, rounds positive fractional sizes to the nearest pixel (minimum one), and retains the transform and registrations. CSS resizing alone is handled by the pointer mapping.

The default mapping handles borders, padding and axis-aligned positive CSS scaling with the canvas bitmap filling its content box. Supply `mapPoint(event)` returning `{ x, y }` in shape coordinates for custom layouts such as a CSS-rotated canvas.
TypeScript defaults to string IDs. Use `createPicker<PolygonWindow>(canvas)` for model objects. Keys follow JavaScript Map equality. Reuse the same object instance across renders, or use a stable primitive ID. Empty space returns `undefined`.

## Lower-level picking

Import `createIndexPicker(width, height)` from `canvas-picker/index-buffer` for direct numeric-index drawing and pixel reads. The high-level picker verifies by default that the candidate shape covers at least half the sampled pixel. At antialiased overlaps a pick can return another overlapping shape or empty space. For an exact geometric boundary test, use the original geometry directly. The playground demonstrates the `verify` and `neighbours` options.

## Run the examples

Run `npm ci` and `npm run dev` in the repository.

| Page | Example |
| --- | --- |
| `/` | Patch cables between ports and edit an envelope. |
| `/examples/basic.html` | Read an index, pick a named shape, and attach a target handler. |
| `/playground.html` | Draw and drag polygons, pick moving shapes, and inspect the colour buffer. |
| `/checks.html` | Runs checks of the hit-testing algorithm in the browser. |

`npm test` runs Chromium tests. Set `CHROME_BIN` to use a local Chromium executable. `npm run build` builds the demo site.

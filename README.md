# [demos](https://hyrfilm.github.io/canvas-picker/)


## canvas-picker

Detects shapes on Canvas 2D from x,y coordinates, mouse, or touch events. Bind event listeners to shapes and treat them like DOM objects.

## Installing

```sh
npm install @hyrfilm/canvas-picker
```

The package ships ES modules and TypeScript declarations with zero runtime dependencies. Import `createPicker` from `@hyrfilm/canvas-picker`, or `createIndexPicker` and `canvasPoint` from `@hyrfilm/canvas-picker/index-buffer`.

## About

This library is useful for games, editors, and other applications where HTML5 Canvas is part of your user interface. It implements color-picking: shapes are rendered into an offscreen buffer with unique flat colors so the shape under any pixel can be identified directly.

This gives you a single way to hit-test arbitrarily complex shapes — SVG paths, thin strokes, curves, overlapping layers — without maintaining parallel hit-testing geometry. It is usually faster than analytical approaches too, unless your shapes are very few and very simple.

`canvas-picker` stays small and layered: use the low-level numeric index buffer when you just want a pixel lookup, or the high-level picker to associate your own objects or IDs with shapes and listen for hover, click, and drag events.

This example builds a draggable dial/knob whose panning updates as you drag:

```ts
import { createPicker } from '@hyrfilm/canvas-picker'

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

Use `picker.on(target, type, handler)` for a specific target, `picker.on(type, handler)` across the canvas, or `picker.track(handler)` to receive the full event stream (for example, to feed a state machine). Each returns an unsubscribe function and shares one gesture tracker. Deleting a target removes its scoped handlers, and `clear()` removes all targets and their scoped handlers.

Bind empty-space input with `picker.on(undefined, 'click', handler)`. Empty-space subscriptions survive `clear()`. Call `dispose()` on unmount to cancel any active drag, release pointer capture, remove all listeners, clear shapes, and release offscreen buffers. Create a fresh picker on remount.

| Event | Target and position |
| --- | --- |
| `enter`, `leave` | The target entered or left, including empty space (`undefined`). |
| `move`, `down`, `up`, `click` | The hit at the current position. |
| `dragstart`, `drag`, `dragend`, `dragcancel` | The target pressed initially. `startX` and `startY` give the press position; `dx` and `dy` are cumulative from that position. |

Every event includes `x`, `y`, and the underlying DOM pointer event in `event`. A primary-button drag starts after five CSS pixels of movement by default (`dragThreshold` tunes this). Supply `canDrag(target, event)` to decide at press time which targets can start a drag; a declined target still receives ordinary pointer and click events. Drag callbacks run before hover picking on a move so updated geometry participates immediately. Set `touch-action: none` on a draggable canvas to reserve touch gestures. Pointer cancellation, lost capture, and window blur cancel an active drag.

### Dropping onto a target underneath

A moving shape drawn above its drop destination covers it in the pick buffer. Pass `ignore` (an array or `Set` of targets) to `pick()` to look through the dragged target(s):

```ts
picker.on('dragend', e => {
  const destination = picker.pick(e.x, e.y, { ignore: [e.target] })
  if (destination) dropOnto(e.target, destination)
})
```

## Shapes and coordinates

- `createPicker(canvas)` takes its initial buffer size from the canvas attributes. Pass `{ width, height }` for a fixed logical resolution, or `createPicker({ width, height })` for picking without DOM input. Requires browser Canvas 2D, `OffscreenCanvas`, and `DOMMatrix`.
- `set(target, shape)` registers hit shapes in the same back-to-front order your app draws them. Updating an existing target keeps its original position in that order.
- `filled(path, margin?)` and `stroked(path, width)` create pick shapes from a `Path2D`. A custom shape receives a context with colour and opacity already set. The picker begins a fresh path for each call and saves and restores context state around it. Shapes may run again during hit verification, so keep drawing callbacks free of application state changes.
- `pick(x, y, options?)` accepts coordinates in the space where shapes draw, and optional `{ ignore }` (an array or `Set` of targets to skip). `setTransform(matrix)` sets the invertible 2D transform from shape space to buffer pixels. Pointer positions and drag deltas use shape units.
- `invalidate()` marks geometry stale after a model changes. The next pick or `drawBuffer(ctx)` redraws it. `drawBuffer` paints the current pick buffer at the destination context’s origin, respecting its transform.
- `resize(width, height)` changes the pick buffer resolution, rounds positive fractional sizes to the nearest pixel (minimum one), and retains the transform and registrations. CSS resizing alone is handled by the pointer mapping.

The default coordinate mapping handles borders, padding, `content-box`/`border-box`, Retina DPR, and axis-aligned positive CSS scaling. Supply `mapPoint(event)` returning `{ x, y }` in shape coordinates for custom layouts such as a CSS-rotated canvas.

TypeScript defaults to string IDs. Use `createPicker<MyNode>(canvas)` for model objects. Keys follow JavaScript `Map` equality (SameValueZero). Reuse the same object instance across renders, or use a stable primitive ID. Empty space returns `undefined`.

## Lower-level picking

Import `createIndexPicker` and `canvasPoint` from `@hyrfilm/canvas-picker/index-buffer` for direct numeric-index drawing and pixel reads:

```ts
import { createIndexPicker, canvasPoint } from '@hyrfilm/canvas-picker/index-buffer'

const picker = createIndexPicker(400, 200)
picker.draw(1, ctx => ctx.fillRect(20, 25, 80, 70))

canvas.addEventListener('click', event => {
  const { x, y } = canvasPoint(canvas, event, picker.ctx.canvas)
  const index = picker.pick(x, y) // 1, or 0 for empty space
})
```

The high-level picker verifies by default that the candidate shape covers at least half the sampled pixel (`verify: true`). At antialiased overlaps a pick can return another overlapping shape or empty space. For an exact geometric boundary test, use the original geometry directly. The playground demonstrates the `verify` and `neighbours` options.

## Run the examples

Run `npm ci` and `npm run dev` in the repository.

Open the Vite URL for the moving circles, node connector, picking playground, beginner examples, and browser checks. The beginner examples' source is in [examples/basic.ts](examples/basic.ts).

`npm test` runs the Chromium tests. Set `CHROME_BIN` to use a local Chromium executable. `npm run build` builds the gallery into `dist/`. `npm run build:package` emits the library and its declarations into `build/package/`. Packing or publishing runs the package build automatically.

## Release

- In GitHub Settings → Pages, choose **GitHub Actions** as the source. The Pages workflow deploys the gallery on pushes to `main`.
- For the first npm release, run `npm publish --access public` from a verified checkout after signing in to npm. Once the package exists, configure an npm trusted publisher for `hyrfilm/canvas-picker` with the workflow filename `publish-npm.yml`. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- For subsequent versions, update the manifest and lockfile together with `npm version <version> --no-git-tag-version`. Tag that commit `v<version>` and publish a GitHub Release for the tag to build, test, and publish to npm.

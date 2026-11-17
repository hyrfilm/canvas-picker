# canvas-picker

Give things on a canvas an ID, then find out what you're pointing at.
Useful for knobs, points, cables, or whatever else you're drawing.

The trick is a hidden canvas: each thing gets its own colour, and the pixel
under the pointer tells us which thing is there. No separate hit-testing
formula for every shape.

Start with [examples/basic.ts](examples/basic.ts) for a small, runnable example
of each layer: numeric indices, string IDs, then pointer events.

```ts
import { createPicker, createIdPicker, trackPointer } from 'canvas-picker'
import { filled, stroked } from 'canvas-picker/shapes'

const ids = createIdPicker(createPicker(400, 300))
ids.set('knob', filled(knobPath, 4))
ids.set('cable', stroked(cablePath, 12))

trackPointer(canvas, ids.pick, (type, id, event) => {
  if (type === 'click' && id) select(id)
})
```

`filled` and `stroked` take `Path2D` paths. Making the pick shape a little
bigger than the visible shape makes small things easier to grab.
A custom shape is just `(ctx) => { /* draw your geometry */ }`. Set any
stroke or text settings it needs, leave colours and opacity to the picker,
and draw relative to the current transform.

Use `set`, `delete`, and `clear` to update the pickable things.
`invalidate()` is for geometry that changed inside an existing shape.
The buffer redraws on the next pick. IDs cannot be blank; empty space
returns `undefined`.

Pointer events are `enter`, `leave`, `down`, `up`, and `click`.
`trackPointer` returns a function that removes its listeners.
The optional `trackDrag` helper in `drag.ts` adds `start`, `move`, `end`,
and `cancel`, with the starting ID and movement in element pixels.
Your app decides what moves and what accepts a drop. Its returned function
removes the drag listeners.
Import it from `canvas-picker/drag`.

The buffer has its own coordinates. If your displayed canvas has a different
size, scale the pointer coordinates before calling `pick`. The demos show how.

By default, we double-check that the shape found in the buffer really is
under the pointer. At overlapping edges you might get another overlapping
shape, or no hit. There are also `{ verify, neighbours }` options on
`createIdPicker`. Neighbour filtering can reduce false matches, but can miss
small shapes too. Try the playground to see the difference.

## Install privately

The package stays private and does not need a registry. Install a full commit
SHA from GitHub using an account with access to this repository:

```sh
npm install 'git+https://github.com/hyrfilm/canvas-picker.git#<full-commit-sha>'
```

Git installs run `prepare` to compile the three library modules and their
TypeScript declarations. Commit the consumer's lockfile to keep that revision
pinned. Only `lib/`, this README, and package metadata enter the installed
package; demos and tests stay in the repository. The library has no runtime
dependencies and needs a browser with `OffscreenCanvas`, `Path2D`, and
`DOMMatrix` support.

For a local package, run `npm pack` and install the resulting tarball.
`npm run build:lib` rebuilds just the library; `npm run build` also builds the
demos as before.

## Try it

```sh
npm install
npm run dev
```

- `/`: cables and an envelope editor.
- `/examples/basic.html`: the three basic examples above (dev server).
- `/playground.html`: SVG triangles, moving circles, polygons you can draw and drag, and picking settings.
- `/checks.html`: the actual browser checks, including overlapping-path scans.

`npm test` runs the checks and pointer/drag interactions in Chrome.
`npm run test:coverage` reports library coverage and writes a browsable report
to `coverage/index.html`.
`npm run build` includes all three pages for `npm run preview`.

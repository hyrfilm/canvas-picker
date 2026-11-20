# canvas-picker

[examples & demos](https://hyrfilm.github.io/hyrfilm/canvas-picker)

This library mostly useful for applications like games, editors, or other applications where you use html5 canvas as part your user-interface. It implements a pretty basic "algorithm" (if it could be called that) called color-picking. TL;DR - you use an offscreen buffer where you render shapes in addition to the regular rendering of a scene. Each shape you want to be able to "pick out" with the mouse or whatever is given a unique color in such a
way that shapes can be uniquely identified.

This has several advantages: a single way of identifying arbitrarily complex shapes, like SVG-paths, or thin lines, multiple overlapping shapes etc. It usually is faster than analytical approaches as well, unless your shapes are very few and very simple.

Canvas-picker is small and simple library. It provides some modules from low-level (ie 'pixel at position') to where you can associate whatever objects, numbers, strings or whatever with your shape, add event listeners and, sort of treat them as they were DOM-objects. So, clicking, hovering, dragging - that sort of thing.

```ts
import { createPicker, createIdPicker, trackPointer } from './pick'
import { filled, stroked } from './shapes'

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

## Installing

```sh
npm install canvas-picker
```

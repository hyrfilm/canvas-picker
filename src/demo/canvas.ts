// Shared canvas sizing and pointer coordinates for the example pages.
function canvasPanel(parent: HTMLElement, title: string, hint: string, width: number, height: number) {
  const card = document.createElement('section')
  card.className = 'card'
  const heading = document.createElement('h2')
  heading.textContent = title
  const description = document.createElement('p')
  description.textContent = hint
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', title)
  canvas.style.aspectRatio = `${width} / ${height}`
  const readout = document.createElement('output')
  readout.className = 'readout'
  card.append(heading, description, canvas, readout)
  parent.append(card)
  const ctx = canvas.getContext('2d')!
  const point = (event: MouseEvent) => ({
    x: event.offsetX * width / canvas.clientWidth,
    y: event.offsetY * height / canvas.clientHeight,
  })
  function fit() {
    const w = Math.round(canvas.clientWidth * devicePixelRatio)
    const h = Math.round(w * height / width)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0)
    ctx.clearRect(0, 0, width, height)
  }
  return { card, canvas, ctx, readout, point, fit }
}

export { canvasPanel }

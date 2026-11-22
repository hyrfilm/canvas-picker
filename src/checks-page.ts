import { checks } from '../test/checks'

const button = document.querySelector<HTMLButtonElement>('#run')!
const summary = document.querySelector<HTMLOutputElement>('#summary')!
const list = document.querySelector<HTMLOListElement>('#check-results')!

async function run() {
  button.disabled = true
  summary.dataset.done = 'false'
  summary.textContent = 'Running…'
  list.replaceChildren()
  let passed = 0
  for (const check of checks) {
    const item = document.createElement('li')
    const heading = document.createElement('div')
    heading.className = 'check-name'
    const name = document.createElement('span')
    name.textContent = check.name
    const status = document.createElement('span')
    heading.append(name, status)
    item.append(heading)
    list.append(item)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    try {
      const result = check.run()
      passed++
      status.textContent = 'Pass'
      status.className = 'pass'
      if (result) {
        const metrics = document.createElement('div')
        metrics.className = 'metric'
        metrics.textContent = `${result.pixels.toLocaleString()} pixels · ${result.hits.toLocaleString()} hits · ${result.unrelated} unrelated shapes`
        item.append(metrics)
      }
    } catch (error) {
      status.textContent = 'Fail'
      status.className = 'fail'
      const details = document.createElement('div')
      details.className = 'metric'
      details.textContent = String(error)
      item.append(details)
    }
  }
  summary.textContent = `${passed} / ${checks.length} passed`
  summary.dataset.passed = String(passed)
  summary.dataset.done = 'true'
  button.disabled = false
}

button.addEventListener('click', run)

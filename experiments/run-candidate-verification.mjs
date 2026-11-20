import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const htmlPath = fileURLToPath(new URL('candidate-verification.prototype.html', import.meta.url))
// Compare against the original baseline embedded in the experiment.
const html = readFileSync(htmlPath, 'utf8')
// Make the standalone experiment available from the existing Vite preview.
mkdirSync(new URL('../dist/experiments/', import.meta.url), { recursive: true })
writeFileSync(new URL('../dist/experiments/candidate-verification.prototype.html', import.meta.url), html)
const profile = mkdtempSync('/private/tmp/canvas-picker-candidate-chrome-')
const output = execFileSync('google-chrome', [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--user-data-dir=' + profile,
  '--dump-dom', 'file://' + htmlPath,
], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
const json = output.match(/<pre id="results">([\s\S]*?)<\/pre>/)?.[1]
if (!json || json === 'pending') throw new Error('The experiment did not finish: ' + output.slice(0, 500))
const result = JSON.parse(json.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
writeFileSync(new URL('candidate-verification.results.json', import.meta.url), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({
  passed: result.passed,
  total: result.total,
  failures: result.checks.filter(check => !check.pass),
  edgeSweep: result.edgeSweep,
  scans: Object.fromEntries(Object.entries(result.scans).map(([name, scan]) => [name, {
    pixels: scan.pixels,
    shapes: scan.shapes,
    singlePixel: scan.singlePixel,
    ninePixelAgreement: scan.ninePixelAgreement,
    verifiedCandidate: scan.verifiedCandidate,
    coverageHistogram: scan.coverageHistogram,
    rejectedAlphaHistogram: scan.rejectedAlphaHistogram,
  }])),
  timing: result.timing,
  fullResults: 'experiments/candidate-verification.results.json',
}, null, 2))
process.exitCode = result.passed === result.total ? 0 : 1

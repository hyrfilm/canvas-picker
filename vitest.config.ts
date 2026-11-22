import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

const executablePath = process.env.CHROME_BIN ?? process.env.PATH
  ?.split(delimiter).map(dir => join(dir, 'google-chrome')).find(path => existsSync(path))

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/color-index.ts',
        'src/coordinates.ts',
        'src/gesture.ts',
        'src/hover.ts',
        'src/index-buffer.ts',
        'src/index.ts',
        'src/pointer.ts',
        'src/registry.ts',
        'src/shapes.ts',
      ],
      reporter: ['text', 'html'],
    },
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: executablePath ? { executablePath } : { channel: 'chrome' } }),
      instances: [{ browser: 'chromium' }],
    },
  },
})

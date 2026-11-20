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
      include: ['src/shapes.ts', 'src/index.ts', 'src/index-buffer.ts', 'src/interaction.ts', 'src/registry.ts'],
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

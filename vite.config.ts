import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rolldownOptions: { input: ['index.html', 'playground.html', 'checks.html', 'examples/basic.html'] },
  },
})

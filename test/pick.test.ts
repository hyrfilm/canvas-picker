import { test } from 'vitest'
import { checks } from './checks'

for (const { name, run } of checks) test(name, () => { run() })

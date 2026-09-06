import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Reuses the app's vite config so `@shared/*` resolves in tests too, without
// pulling vitest types into tsconfig.app.json.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // src/** only — keeps vitest away from tests/e2e/*.spec.ts, which is Playwright's
      include: ['src/**/*.test.ts'],
      // every unit under test is pure: no DOM, no testing-library
      environment: 'node',
      // explicit imports of describe/it/expect, so no global type augmentation is needed
      globals: false,
    },
  }),
)

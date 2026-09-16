import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Reuses the app's vite config so `@shared/*` resolves in tests too, without
// pulling vitest types into tsconfig.app.json.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Never tests/e2e/*.spec.ts, which is Playwright's. tests/unit is where a test that
      // is about the *content* files rather than about one module lives (docs/weetjes.md §10).
      include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts'],
      // every unit under test is pure: no DOM, no testing-library
      environment: 'node',
      // explicit imports of describe/it/expect, so no global type augmentation is needed
      globals: false,
    },
  }),
)

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Plain Vitest, not `@nuxt/test-utils`.
 *
 * Everything under test here is a pure function over static data —
 * `utils/locationSearch.ts`, `utils/settlements.ts`,
 * `utils/locationDataValidation.ts`. None of it touches the Nuxt runtime, so a
 * Nuxt environment would add a build step and a browser-ish global scope for
 * nothing. The only Nuxt-ism these files rely on is the `~` alias, which is
 * resolved below.
 */
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
})

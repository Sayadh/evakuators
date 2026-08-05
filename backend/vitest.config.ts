import { defineConfig } from 'vitest/config'

/**
 * Plain Vitest, deliberately without `@nestjs/testing` — the same call the
 * frontend's `vitest.config.ts` makes, for the same reason.
 *
 * ## Why no DI container
 *
 * Every class under test here takes its collaborators through the constructor,
 * so a test can hand it a fake directly: `new AdminService(fakeRepo, …)`. That
 * is the whole benefit `Test.createTestingModule()` would provide, minus the
 * cost — `@nestjs/testing` resolves providers from `design:paramtypes`
 * metadata, which esbuild (what Vitest transforms TypeScript with) does not
 * emit. Making it work would mean adding `unplugin-swc` and a second
 * TypeScript pipeline to the build, to gain wiring we can do in one line.
 *
 * The one thing that genuinely needs Nest is route/guard registration, and
 * that is read straight off the decorator metadata instead — see
 * `test/admin.controller.spec.ts`. Legacy decorators (which is what Nest uses)
 * ARE supported by esbuild; only the extra type metadata is not, and route
 * paths and guards do not depend on it.
 *
 * ## Scope
 *
 * Unit tests over pure logic and metadata. Nothing here opens a database
 * connection: `PrismaService` is always a fake. Anything that needs real
 * Postgres belongs in a manual check against a local backend, documented in
 * `docs/testing.md`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
  },
})

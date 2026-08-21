#!/usr/bin/env node
/**
 * Boot the real, compiled AppModule far enough to resolve every provider in
 * the dependency graph — then throw it away without listening on a port or
 * touching the database.
 *
 * ## Why this exists as its own step
 *
 * NestJS resolves constructor injection at RUNTIME, from `design:paramtypes`
 * metadata. Nothing before this point sees it:
 *
 * - `tsc` / `nest build` type-check the constructor's *types*, which are
 *   correct. A provider that is listed in one module's `providers` but never
 *   `exports`ed is a perfectly well-typed program.
 * - The Vitest suite deliberately runs without `@nestjs/testing` (see
 *   `vitest.config.ts` for that decision and its reasoning) — every unit test
 *   constructs its subject directly, `new AdminService(fakeRepo, …)`, so no
 *   test ever compiles the module graph.
 *
 * So a missing `exports:` entry passes the build and all 403 tests, and fails
 * for the first time when PM2 starts the process in production — as a crash
 * loop, with the API simply absent and the site rendering as if every table
 * were empty. That is exactly what happened on the deploy that first carried
 * `ConsentRequestContextService`:
 *
 *     Nest can't resolve dependencies of the RegistrationController
 *     (RegistrationService, ?). Please make sure that the argument
 *     ConsentRequestContextService at index [1] is available in the
 *     RegistrationModule context.
 *
 * This script closes that gap: it is the cheapest possible thing that fails
 * for the same reason production would, and it runs in about a second.
 *
 * ## Usage
 *
 *     npm run build && npm run check:di
 *
 * Run it after every build, before `pm2 restart` — see docs/deployment.md.
 * Exits 0 on a graph that resolves, 1 with the real Nest error otherwise.
 *
 * ## Why the fake environment variables
 *
 * `validateEnv` (zod) runs when ConfigModule loads, and would reject an empty
 * environment before the graph is ever built. These placeholders exist only to
 * get past that gate — they are never used to connect to anything, because
 * `NestFactory.create()` resolves providers and calls `onModuleInit` but this
 * script closes the app immediately and never calls `listen()`. `||=` means a
 * real value already in the environment (running this on the server, where
 * backend/.env is loaded) always wins.
 */
process.env.NODE_ENV ||= 'production'
process.env.DATABASE_URL ||= 'postgresql://u:p@127.0.0.1:5432/di_graph_check'
process.env.SUPABASE_URL ||= 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'di-graph-check'
process.env.SUPABASE_STORAGE_BUCKET ||= 'di-graph-check'
process.env.TELEGRAM_BOT_TOKEN ||= 'di-graph-check'
process.env.TELEGRAM_BOT_USERNAME ||= 'di-graph-check'
process.env.TELEGRAM_WEBHOOK_SECRET ||= 'di-graph-check'
process.env.DRIVER_JWT_SECRET ||= 'di-graph-check-driver-secret-32-chars'
process.env.ADMIN_JWT_SECRET ||= 'di-graph-check-admin-secret-32-chars'

const path = require('node:path')

const distMain = path.join(__dirname, '..', 'dist', 'app.module.js')
if (!require('node:fs').existsSync(distMain)) {
  console.error('check:di — dist/app.module.js not found. Run `npm run build` first.')
  process.exit(1)
}

const { NestFactory } = require('@nestjs/core')
const { AppModule } = require(distMain)

NestFactory.create(AppModule, { logger: false })
  .then(async (app) => {
    await app.close()
    console.log('check:di — OK, every provider in the graph resolves')
    process.exit(0)
  })
  .catch((error) => {
    console.error('check:di — FAILED. Nest could not build the module graph:\n')
    console.error(error && error.message ? error.message : error)
    console.error(
      '\nThis is the error PM2 would hit at boot. Usually a provider is listed in one\n' +
        "module's `providers` but missing from its `exports`, while another module's\n" +
        'controller or service injects it.',
    )
    process.exit(1)
  })

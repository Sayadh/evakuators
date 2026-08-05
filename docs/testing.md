# Testing

Two completely separate Vitest setups, one per project — same split as
everything else in this monorepo (see CLAUDE.md § "Monorepo layout"). Neither
config touches the other, and neither needs the other's dependencies
installed.

```bash
# frontend/
npm run test         # vitest run — one pass, exits, what CI should use
npm run test:watch   # vitest — reruns on file change, for local iteration

# backend/
npm run test
npm run test:watch
```

## What is, and is not, covered

Both suites are **unit tests over pure logic and metadata**. Nothing here
opens a real database connection, calls the real Supabase Storage API, hits
Telegram, or boots a Nest application with real providers. That is a
deliberate boundary, not a gap that happened by accident:

- Frontend tests exercise pure functions over **static data**
  (`data/*.ts`, `utils/locationSearch.ts`, `utils/transliteration.ts`,
  `utils/settlements.ts`, `utils/locationDataValidation.ts`). None of it
  touches the Nuxt runtime — see the "Why plain Vitest" note in
  `frontend/vitest.config.ts`.
- Backend tests exercise services/repositories against **fake Prisma
  objects** built by hand in the test file, and read Nest's own route
  metadata directly off decorators rather than booting an HTTP server.

What this does **not** replace:

- A real end-to-end check that a page renders correctly against a live
  backend — see `docs/local-development.md` for running both projects
  together, and the "SSR is exempt" / CORS notes in
  `docs/auth-and-security.md` for why client-side navigation and SSR can
  behave differently against a remote API.
- A real migration/schema check — `npm run prisma:migrate` against a local
  Postgres is still the only thing that proves a Prisma schema change is
  valid. See `docs/data-model.md`.
- Manual verification of anything involving the Telegram bots, which
  (`docs/local-development.md` § "one webhook, globally") cannot be tested
  locally against production's webhook at all.

If you're an AI agent about to change backend or frontend logic: run the
relevant suite before and after your change, but do not treat a green suite
as proof the change is safe end-to-end. It proves the pure logic you touched
still does what its test says it should. Anything that talks to Postgres,
Supabase, or Telegram still needs a real local backend run (or explicit
user approval to touch production, per the standing rule in CLAUDE.md-style
instructions for this repo).

## Frontend (`frontend/vitest.config.ts`)

```ts
export default defineConfig({
  resolve: { alias: { '~': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.spec.ts'] },
})
```

Plain Vitest, not `@nuxt/test-utils`. The only Nuxt-ism the tested files rely
on is the `~` import alias, resolved above without booting Nuxt itself.

| File | Covers |
| --- | --- |
| `tests/transliteration.spec.ts` | `toSearchKey()` — Armenian/Latin/Russian script folding, and the documented cases it deliberately does NOT fix (see `utils/transliteration.ts`'s own doc comment) |
| `tests/locationSearch.spec.ts` | `searchLocations()` / `findLocationExact()` ranking, settlement → city/zone routing, dedup by destination |
| `tests/locationData.spec.ts` | `validateLocationData()` — dangling ids, slug collisions, ambiguous names across the static geography datasets |

Add a new frontend test here only if it is a pure function over data the
frontend already owns. Anything that needs a browser DOM, a mounted
component, or Nuxt's runtime config belongs in a separate setup this repo
does not have yet — don't force it into this config.

## Backend (`backend/vitest.config.ts`)

```ts
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.spec.ts'] },
})
```

### Why no `@nestjs/testing`

`Test.createTestingModule()` resolves constructor dependencies from
`design:paramtypes` decorator metadata, which requires TypeScript's
`emitDecoratorMetadata` to have run through a real `tsc`-based transform.
Vitest transforms `.ts` with esbuild, which does not emit that metadata —
making the DI container work would mean adding `unplugin-swc` and running a
second TypeScript pipeline just for tests.

It isn't needed here. Every service/repository in this codebase takes its
collaborators through the constructor, so a test can hand it a fake directly:

```ts
const fakePrisma = { towTruck: { count: vi.fn(async () => 46) } } as unknown as PrismaService
const repo = new TowTrucksRepository(fakePrisma)
```

That is the whole benefit a DI container would have provided for a unit
test, without the build-time cost.

### Testing routes without booting the app

Booting a real Nest app needs a live Postgres connection, Supabase
credentials and a Telegram bot token — three external systems, to answer a
question (which method handles which path, in what order, behind which
guard) that is fully decided at class-definition time. So route tests read
the same metadata Nest itself reads, off the raw class:

```ts
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants'
Reflect.getMetadata(PATH_METADATA, AdminController.prototype.someHandler)
```

See `backend/test/admin.controller.count-route.spec.ts` for the full
pattern, including a route-shadowing check: Nest (like Express) matches
routes segment-by-segment in **declaration order**, so a `@Get('x/:id')`
declared above a `@Get('x/count')` would silently swallow every request for
`/x/count`. Nothing in the type system catches that; only a test that walks
the declared route order does.

| File | Covers |
| --- | --- |
| `test/tow-trucks.repository.count.spec.ts` | `TowTrucksRepository.countForAdmin()` — `inactive = total - active` always holds, the total query has no `where` (counts every row, not just active ones), the two counts run concurrently |
| `test/admin.controller.count-route.spec.ts` | `GET /admin/tow-trucks/count` is mounted correctly, sits behind `AdminJwtGuard`, is declared before any route that could shadow it, and the shadowing detector itself is tested against known true/false cases |

### When you touch `AdminController`, `AdminService`, or `TowTrucksRepository`

Re-run `npm run test` in `backend/` before committing. The route-order test
in particular exists specifically to catch a new `tow-trucks/:id`-shaped
route added above `tow-trucks/count` — a mistake that compiles cleanly,
passes `tsc --noEmit`, and only breaks at request time in production.

## What "senior-level" means for tests in this repo, going forward

- Test the **general rule**, not today's fixture, wherever the rule is
  simple to state — e.g. "no literal route segment is ever shadowed by an
  earlier `:param` route of the same shape", not "`count` comes before
  `:id`". The latter stops protecting anything the day the route list
  changes.
- When a computed value has an invariant (`active + inactive === total`),
  assert the invariant across a spread of inputs, not just one hand-picked
  example.
- Prefer a fake built from the real class's actual dependency shape over a
  loose `any`-typed mock — a fake that doesn't match the constructor breaks
  the moment the constructor does, which is the point.
- Keep backend tests off real Postgres. If a change genuinely needs a real
  database to verify (a migration, an index, a constraint), that
  verification is a documented manual step (see `docs/data-model.md`), not
  a Vitest suite silently opening a connection to whatever `DATABASE_URL`
  happens to be set.

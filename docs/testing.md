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
| `tests/formatDistance.spec.ts` | `formatDistance`/`formatDuration` and the two line builders — the metre/kilometre thresholds, the never-zero floors, and that «Ճանապարհով» and «Ուղիղ գծով» are not interchangeable |
| `tests/coordinates.spec.ts` | `parseCoordinates()` — every accepted separator, every rejection class (illegal character, not-two-numbers, out of ±90/±180, outside Armenia), the order those checks fire in, and that `formatCoordinates()` round-trips back through the parser |

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
| `test/telegram.service.outbound-allowlist.spec.ts` | `TELEGRAM_OUTBOUND_ALLOWED_CHAT_IDS` — a chat id not on the list never reaches `fetch()` at all, a listed one does, an empty list is unrestricted (production's real behaviour). See `docs/deployment.md` § "Staging environment" for what this exists to prevent |
| `test/supabase-storage.service.read-only.spec.ts` | `SUPABASE_STORAGE_READ_ONLY` — `uploadWebp()`/`remove()` refuse before the Supabase client is ever called, an empty `remove([])` stays a no-op regardless, the flag is unrestricted when false |
| `test/nearest.spec.ts` | The nearest-search logic that is decided in code: the cache's rounded keys (~110 m — the only form a visitor's position takes on the server), TTL expiry, the size cap that keeps it from being an unbounded write primitive; `RouteMatrixService` returning **null** rather than throwing on every failure path, sending `[longitude, latitude]` origin-first, and dropping a destination with a distance but no duration; and that the endpoint is a POST with a throttle stricter than the global default. **The PostGIS query itself is not tested here** — it needs a real database with the extension, which this suite deliberately excludes (see above); it is a documented manual check against staging |
| `test/coordinates.spec.ts` | `SetCoordinatesDto` (range, `NaN`/`Infinity`, non-numbers), `assertWithinArmenia` (including a swapped pair and the padded box edges), `decimalToNumber` (null → undefined, never 0), and that both coordinate endpoints are mounted behind their auth guard with no tamperable id on the driver's route |

### When you touch `AdminController`, `AdminService`, or `TowTrucksRepository`

Re-run `npm run test` in `backend/` before committing. The route-order test
in particular exists specifically to catch a new `tow-trucks/:id`-shaped
route added above `tow-trucks/count` — a mistake that compiles cleanly,
passes `tsc --noEmit`, and only breaks at request time in production.

## One test does talk to a real database

`backend/test/migrations.pglite.spec.ts` applies **every migration, in order,
against real Postgres** — PGlite, which is Postgres itself compiled to WASM and
running in-process, so it needs no server, no container and no credentials.

It exists because the rest of this suite structurally cannot see the failures
that only exist in SQL: a migration that does not apply, a constraint that does
not constrain, a foreign key whose `ON DELETE` does something other than what
the schema comment claims. Those surface during `prisma migrate deploy` on the
VPS, with the app already stopped.

So it deliberately asserts only on things **Prisma's schema cannot express**,
and that therefore have no other guard anywhere:

- the partial unique index behind "one pending profile change per truck"
  (`WHERE status = 'PENDING'`, hand-written in the migration),
- `ON DELETE SET NULL` on a queued edit's photos versus `ON DELETE CASCADE` on
  the truck's,
- which rows the image-ownership predicate can actually see,
- that the `heavyEquipment` migration still has no backfill.

A second file drives the same engine for a different reason:
`profile-change-jsonb.spec.ts` compares a value that has actually been through a
`jsonb` column. Postgres reorders object keys there, so a diff built on
`JSON.stringify` reported a change on every driver save — and no unit test could
see it, because both sides of a unit test are built in JavaScript, in the same
order, and a mocked Prisma returns the object it was handed.

Two limitations, both deliberate:

- **PostGIS is not available in PGlite**, so the three PostGIS statements in the
  nearest-search migration are stripped before it runs. That one migration is
  the one this test does not prove — it is also the one that already needs a
  superuser and a host package by hand (see the file). Everything after it *is*
  proved, so a later migration depending on the spatial column would fail here
  loudly.
- **It does not go through Prisma.** It runs the DDL and raw SQL, not the
  client, so it says nothing about whether a query in a repository is spelled
  correctly. Where that matters, the same test file also reads the repository
  source and asserts the predicate is still there — both halves are needed, and
  the file says so where it does it.

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

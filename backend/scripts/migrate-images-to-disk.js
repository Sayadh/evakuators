#!/usr/bin/env node
/**
 * One-off: move every tow truck photo from Supabase Storage to MEDIA_DIR on
 * this server and point the database rows at the new URLs.
 *
 * Why: see docs/deployment.md § "Image storage". In short, Supabase's free
 * plan ran out of egress and answered every photo with HTTP 402; the files
 * now live on the VPS and nginx serves them.
 *
 * ## Usage (on the VPS, from backend/, as the user that owns MEDIA_DIR)
 *
 *   node scripts/migrate-images-to-disk.js            # download only, DB untouched
 *   node scripts/migrate-images-to-disk.js --apply    # download, then rewrite URLs
 *   node scripts/migrate-images-to-disk.js --verify   # audit only: every row ↔ its file
 *
 * Reads backend/.env: DATABASE_URL, MEDIA_DIR, MEDIA_PUBLIC_URL — and, for
 * the download only, the old SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY if they
 * are still there. With the key, a file the public URL refuses is retried
 * through Supabase's authenticated endpoint.
 *
 * ## Properties worth relying on
 *
 * - **Idempotent.** A file already on disk (and a valid WebP) is never
 *   downloaded again; a row already pointing at MEDIA_PUBLIC_URL is skipped.
 *   Run it as many times as it takes — e.g. once now, and again the day
 *   Supabase's monthly quota resets if some files were still refused.
 * - **The DB only changes for files that are really on disk.** A row whose
 *   download failed keeps its old URL, so a partial run never turns a
 *   recoverable photo into a dangling link.
 * - **`path` never changes.** Files keep their bucket-relative path
 *   (`uploads/<uuid>.webp`) under MEDIA_DIR, which is what deletion uses, so
 *   only the `url` column is rewritten.
 * - **A photo can never end up on another driver's page.** Only `url` is
 *   rewritten; `towTruckId`, `registrationRequestId`, `position` — everything
 *   that says whose photo it is and where it sits in the gallery — is never
 *   touched. And a file is only accepted for a row after proving it is THAT
 *   row's photo:
 *     1. the source URL's object name is the row's own `path` (so the file is
 *        saved under, and later served from, exactly the name the row owns —
 *        `path` is UNIQUE, so no two rows can share a file);
 *     2. its byte length equals the row's `sizeBytes`, and its decoded width
 *        and height equal the row's `width`/`height` — all three recorded by
 *        the backend from the exact bytes it uploaded. A different photo, a
 *        truncated download or a quota/HTML error page cannot pass.
 *   The same check is applied to a file that is already on disk; one that
 *   fails it is re-downloaded rather than trusted.
 * - **The rewrite is conditional** on the row's URL being exactly what this
 *   run read (`updateMany where { id, url: <old> }`), so a driver editing their
 *   gallery mid-run is never overwritten by a stale value.
 * - `--verify` re-checks every migrated row against its file and changes
 *   nothing — run it after `--apply`, and any time you want proof.
 *
 * Take a database backup first (scripts/backup-db.sh) — `--apply` is an
 * UPDATE on every migrated row.
 */
require('dotenv/config')
const { PrismaClient } = require('@prisma/client')
const sharp = require('sharp')
const { mkdir, readFile, rename, rm, writeFile } = require('node:fs/promises')
const { dirname, resolve, sep } = require('node:path')

const APPLY = process.argv.includes('--apply')
const VERIFY = process.argv.includes('--verify')
const CONCURRENCY = 4
const ATTEMPTS = 3
const TIMEOUT_MS = 30_000

const mediaDir = resolve(required('MEDIA_DIR'))
const publicUrl = required('MEDIA_PUBLIC_URL').replace(/\/+$/, '')
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function required(name) {
  const value = process.env[name]
  if (!value) {
    console.error(`${name} is not set — add it to backend/.env first (see .env.example)`)
    process.exit(1)
  }
  return value
}

function fileFor(path) {
  const file = resolve(mediaDir, path)
  if (!file.startsWith(mediaDir + sep)) throw new Error(`path escapes MEDIA_DIR: ${path}`)
  return file
}

/** RIFF....WEBP — the first 12 bytes of every WebP file */
function isWebp(buffer) {
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
}

/**
 * Proves `body` is this row's photo, not merely "a WebP": exact byte length and
 * decoded dimensions must equal what the backend recorded at upload time.
 * Returns null when it matches, otherwise the reason it does not.
 */
async function mismatch(image, body) {
  if (!isWebp(body)) return 'not a WebP file'
  if (body.length !== image.sizeBytes) {
    return `size ${body.length} B, row says ${image.sizeBytes} B`
  }
  let meta
  try {
    meta = await sharp(body).metadata()
  } catch (error) {
    return `cannot decode: ${error.message}`
  }
  if (meta.width !== image.width || meta.height !== image.height) {
    return `dimensions ${meta.width}x${meta.height}, row says ${image.width}x${image.height}`
  }
  return null
}

/** The on-disk file, if it exists and is provably this row's photo */
async function verifiedOnDisk(image) {
  try {
    const body = await readFile(fileFor(image.path))
    return (await mismatch(image, body)) === null
  } catch {
    return false
  }
}

/** `.../object/public/<bucket>/<path>` → bucket, or null for a non-Supabase URL */
function bucketOf(url) {
  const match = /\/storage\/v1\/object\/public\/([^/]+)\//.exec(url)
  return match ? match[1] : null
}

/** `.../object/public/<bucket>/<path>` → `<path>`, or null for a non-Supabase URL */
function objectPathOf(url) {
  const match = /\/storage\/v1\/object\/public\/[^/]+\/(.+)$/.exec(url.split('?')[0])
  return match ? decodeURIComponent(match[1]) : null
}

function sourcesFor(image) {
  const sources = [{ label: 'public', url: image.url, headers: {} }]
  const bucket = bucketOf(image.url)
  if (supabaseUrl && supabaseKey && bucket) {
    sources.push({
      label: 'authenticated',
      url: `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${image.path}`,
      headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
    })
  }
  return sources
}

async function download(image) {
  const errors = []
  for (const source of sourcesFor(image)) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const response = await fetch(source.url, {
          headers: source.headers,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        const body = Buffer.from(await response.arrayBuffer())
        if (!response.ok) {
          const detail = body.toString('utf8', 0, 160).replace(/\s+/g, ' ')
          errors.push(`${source.label}: HTTP ${response.status} ${detail}`)
          // 4xx will not change on retry — 402 quota, 404 missing, 403 key
          if (response.status < 500) break
        } else {
          const reason = await mismatch(image, body)
          if (reason === null) return body
          errors.push(`${source.label}: ${reason} — refused, not this row's photo`)
          break
        }
      } catch (error) {
        errors.push(`${source.label}: ${error.message}`)
      }
      await new Promise((r) => setTimeout(r, 500 * attempt))
    }
  }
  throw new Error(errors.join(' | '))
}

async function save(file, body) {
  await mkdir(dirname(file), { recursive: true, mode: 0o755 })
  const temporary = `${file}.${process.pid}.tmp`
  try {
    await writeFile(temporary, body, { mode: 0o644 })
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

function owner(image) {
  return {
    id: image.id,
    path: image.path,
    towTruckId: image.towTruckId,
    registrationRequestId: image.registrationRequestId,
  }
}

function describe(row) {
  const whose =
    row.towTruckId != null
      ? `truck #${row.towTruckId}`
      : row.registrationRequestId != null
        ? `registration #${row.registrationRequestId}`
        : 'unattached'
  return `image #${row.id} (${whose}) ${row.path}`
}

/**
 * Read-only audit: every row that points at MEDIA_PUBLIC_URL must point at
 * exactly its own path, and that file must be provably its photo. Rows still
 * on the old URL are counted, not failed — they are simply not migrated yet.
 */
async function verify(prisma, images) {
  const problems = []
  let ok = 0
  let notMigrated = 0
  for (const image of images) {
    if (!image.url.startsWith(`${publicUrl}/`)) {
      notMigrated++
      continue
    }
    const expected = `${publicUrl}/${image.path}`
    if (image.url !== expected) {
      problems.push({ ...owner(image), reason: `url is ${image.url}, expected ${expected}` })
      continue
    }
    let body
    try {
      body = await readFile(fileFor(image.path))
    } catch (error) {
      problems.push({ ...owner(image), reason: `file missing: ${error.message}` })
      continue
    }
    const reason = await mismatch(image, body)
    if (reason) problems.push({ ...owner(image), reason })
    else ok++
  }

  console.log(`images in DB      ${images.length}`)
  console.log(`verified OK       ${ok}`)
  console.log(`not migrated yet  ${notMigrated}`)
  console.log(`PROBLEMS          ${problems.length}`)
  for (const problem of problems) console.log(`  ${describe(problem)}\n      ${problem.reason}`)

  await prisma.$disconnect()
  process.exit(problems.length > 0 ? 3 : 0)
}

async function main() {
  const prisma = new PrismaClient()
  const images = await prisma.towTruckImage.findMany({
    select: {
      id: true,
      path: true,
      url: true,
      sizeBytes: true,
      width: true,
      height: true,
      towTruckId: true,
      registrationRequestId: true,
    },
    orderBy: { id: 'asc' },
  })

  if (VERIFY) return verify(prisma, images)

  const summary = { total: images.length, alreadyMigrated: 0, onDisk: 0, downloaded: 0, failed: [] }
  const ready = [] // rows whose file is on disk and whose URL still needs rewriting

  const pending = images.filter((image) => {
    if (image.url.startsWith(`${publicUrl}/`)) {
      summary.alreadyMigrated++
      return false
    }
    return true
  })

  let cursor = 0
  let finished = 0
  async function worker() {
    while (cursor < pending.length) {
      const image = pending[cursor++]
      try {
        const objectPath = objectPathOf(image.url)
        if (objectPath !== null && objectPath !== image.path) {
          throw new Error(`URL names "${objectPath}" but the row's path is "${image.path}" — refused`)
        }
        const file = fileFor(image.path)
        if (await verifiedOnDisk(image)) {
          summary.onDisk++
        } else {
          await save(file, await download(image))
          summary.downloaded++
        }
        ready.push(image)
      } catch (error) {
        summary.failed.push({ ...owner(image), reason: error.message })
      }
      finished++
      process.stdout.write(`\r${finished}/${pending.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  process.stdout.write('\n')

  let rewritten = 0
  const changedMeanwhile = []
  if (APPLY && ready.length > 0) {
    // One transaction, and each UPDATE only matches if the row still has the
    // URL this run read — `url` is the ONLY column written, never the owner.
    const results = await prisma.$transaction(
      ready.map((image) =>
        prisma.towTruckImage.updateMany({
          where: { id: image.id, url: image.url },
          data: { url: `${publicUrl}/${image.path}` },
        }),
      ),
    )
    results.forEach((result, index) => {
      if (result.count === 1) rewritten++
      else changedMeanwhile.push(ready[index].id)
    })
  }

  console.log(`\nMEDIA_DIR         ${mediaDir}`)
  console.log(`MEDIA_PUBLIC_URL  ${publicUrl}`)
  console.log(`images in DB      ${summary.total}`)
  console.log(`already migrated  ${summary.alreadyMigrated}`)
  console.log(`already on disk   ${summary.onDisk}`)
  console.log(`downloaded now    ${summary.downloaded}`)
  console.log(`failed            ${summary.failed.length}`)
  console.log(
    APPLY
      ? `URLs rewritten    ${rewritten}` +
          (changedMeanwhile.length
            ? ` (skipped, changed during the run — re-run: #${changedMeanwhile.join(', #')})`
            : '')
      : `URLs NOT rewritten (dry run) — ${ready.length} ready; re-run with --apply`,
  )
  for (const failure of summary.failed) {
    console.log(`  ${describe(failure)}\n      ${failure.reason}`)
  }
  if (APPLY) console.log('\nNext: node scripts/migrate-images-to-disk.js --verify')

  await prisma.$disconnect()
  process.exit(summary.failed.length > 0 ? 2 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

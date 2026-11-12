/**
 * Metro, plus ONE addition: `~/…` resolves into ../frontend.
 *
 * The app's sign-up IS the website's registration (2026-11), and its profile
 * editor is the website dashboard's. Their rules — the blank form, every
 * validator, the coverage cap, which questions a vehicle type is asked, the
 * geography and the service taxonomy — live in pure TypeScript modules under
 * frontend/{constants,data,utils,types}. Importing those exact files, rather
 * than copying them, is what makes the app and the website agree by
 * construction: a rule changed on the site is changed in the next app build,
 * and there is no copy to drift (the failure mode CLAUDE.md's "manual sync
 * points" are about).
 *
 * Only PURE modules may be imported this way — no Vue, no Nuxt auto-imports,
 * no `useI18n()`. `mobile/test/sharedImports.test.ts` walks every `~/` import
 * the app makes and fails if one reaches a file that is not.
 *
 * The frontend's own `node_modules`, `.nuxt` and `.output` are blocked: the
 * app must never bundle a package from the website's dependency tree.
 *
 * EAS builds a project in a monorepo from the whole repository, so
 * ../frontend is present there too (docs/live-dispatch/06-mobile.md).
 */
const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const projectRoot = __dirname
const frontendRoot = path.resolve(projectRoot, '../frontend')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [...(config.watchFolders ?? []), frontendRoot]

const escape = (value) => value.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
const frontendInternals = new RegExp(`^${escape(frontendRoot)}[/\\\\](node_modules|\\.nuxt|\\.output)[/\\\\].*`)
const existingBlockList = config.resolver.blockList
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  frontendInternals,
]

const upstreamResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest
  if (moduleName.startsWith('~/')) {
    return resolve(context, path.join(frontendRoot, moduleName.slice(2)), platform)
  }
  return resolve(context, moduleName, platform)
}

module.exports = config

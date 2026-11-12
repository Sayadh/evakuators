/**
 * An admin token is only as good as the account behind it (2026-11-12
 * security audit). Tokens are stateless and live 24 h, so before this a
 * DELETED admin, or one whose role was lowered, kept full access until the
 * token expired. Every admin/ops request now checks that the user still
 * exists with the same role as in the token.
 *
 * Cached for a few seconds per user so a busy console does not hit the
 * database on every call; a deletion takes effect within CACHE_MS.
 */
import type { PrismaService } from '../prisma/prisma.service'

const CACHE_MS = 15_000
const cache = new Map<number, { role: string | null; at: number }>()

export async function adminAccountRole(prisma: PrismaService, userId: number): Promise<string | null> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.role
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
  const role = user?.role ?? null
  if (cache.size > 1000) cache.clear()
  cache.set(userId, { role, at: Date.now() })
  return role
}

/** True while the account still exists with the role the token was issued for */
export async function adminSessionStillValid(prisma: PrismaService, userId: number, tokenRole: string): Promise<boolean> {
  if (!Number.isSafeInteger(userId)) return false
  return (await adminAccountRole(prisma, userId)) === tokenRole
}

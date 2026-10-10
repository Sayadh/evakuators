import { Module } from '@nestjs/common'
import { RouteMatrixService } from './route-matrix.service'
import { RouteQuotaService } from './route-quota.service'

/**
 * Road distances, and the one daily budget they are paid for from.
 *
 * ## Why this is a module of its own
 *
 * Both services started inside `nearest`, because that was the only feature
 * that routed. `/admin/dispatch`'s coordinate search now routes too, and the
 * budget they share is a single key with a single daily allowance — so the
 * count has to be a single count. Two copies would be two features each
 * believing it had the whole 480.
 *
 * It is NOT exported from `NearestModule` for the same reason: `nearest` is
 * deletable by removing its folder and one line in `app.module.ts`, and an
 * admin screen reaching through it for a shared service would quietly end
 * that. Infrastructure that two features need belongs beside them, not inside
 * one of them.
 *
 * `RouteQuotaService` is a singleton and must stay one — see its own comment
 * on why the count is in memory and global rather than per visitor.
 */
@Module({
  providers: [RouteMatrixService, RouteQuotaService],
  exports: [RouteMatrixService, RouteQuotaService],
})
export class RoutingModule {}

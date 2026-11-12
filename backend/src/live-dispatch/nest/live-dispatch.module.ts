/**
 * Wires live dispatch into the API process.
 *
 * Deletable the same way NearestModule is: this folder plus one line in
 * app.module.ts. Nothing pre-existing imports from here.
 */
import { Body, Controller, HttpCode, HttpStatus, Injectable, Module, OnApplicationBootstrap, OnApplicationShutdown, Post, UseFilters } from '@nestjs/common'
import { adminSessionStillValid } from '../../admin-auth/admin-session-check'
import { PrismaService } from '../../prisma/prisma.service'
import { ConfigService } from '@nestjs/config'
import { HttpAdapterHost } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { Throttle } from '@nestjs/throttler'
import type { Server } from 'node:http'
import { AdminAuthModule } from '../../admin-auth/admin-auth.module'
import { DriverAuthModule } from '../../driver-auth/driver-auth.module'
import { MyTowTruckModule } from '../../my-tow-truck/my-tow-truck.module'
import { NearestModule } from '../../nearest/nearest.module'
import { PrivacyConsentModule } from '../../privacy-consent/privacy-consent.module'
import { ProfileChangesModule } from '../../profile-changes/profile-changes.module'
import { RegistrationModule } from '../../registration/registration.module'
import { SubscriptionsModule } from '../../subscriptions/subscriptions.module'
import { NearestService } from '../../nearest/nearest.service'
import { TowTrucksModule } from '../../tow-trucks/tow-trucks.module'
import { TowTrucksService } from '../../tow-trucks/tow-trucks.service'
import { RealtimeGateway } from '../notify/ws-gateway'
import { NearbyLiveService, PostgisLiveQuery } from '../public/nearby-live.service'
import { GuardedRouting } from '../routing/routing-provider'
import { DriverAppGuard, OpsGuard, verifyDriverAppToken, verifyOpsToken } from './auth'
import { DriverAppController } from './driver-app.controller'
import { DispatchErrorFilter } from './http'
import { OpsDispatchController } from './ops.controller'
import { LiveDispatchRuntimeHolder } from './runtime.provider'
import { DriverAppSiteProfileGuard } from './site-profile.guard'
import { WalletPayLinks, WalletPaymentsRegistrar } from './wallet-payments'
import { IdramModule } from '../../idram/idram.module'
import { SiteListingModule } from '../../site-listing/site-listing.module'

@Injectable()
export class NearbyLiveProvider {
  readonly service: NearbyLiveService

  constructor(holder: LiveDispatchRuntimeHolder, towTrucks: TowTrucksService, nearest: NearestService) {
    const rt = holder.runtime
    // Same provider as dispatch, separate daily budget (`budgetKey`) — visitors
    // can never spend the elements dispatch needs.
    const publicRouting = new GuardedRouting(
      rt.routingProvider,
      rt.db,
      {
        // A visitor waits at most ~2 s for road figures, then gets the
        // straight-line list (never presented as road distance).
        timeoutMs: Math.min(rt.config.routingTimeoutMs, 2000),
        retries: 0,
        baseBackoffMs: 250,
        maxConcurrent: 2,
        dailyElementBudget: () => Number(process.env.PUBLIC_NEARBY_DAILY_ELEMENT_BUDGET ?? 5000),
        // With ORS this search would be a THIRD consumer of the shared key,
        // outside both shares (site 100 / dispatch): no ORS requests unless
        // PUBLIC_NEARBY_DAILY_REQUESTS is set (and taken from another share).
        // Live entries then show straight-line distance, labelled as such.
        dailyRequestBudget:
          process.env.PUBLIC_NEARBY_DAILY_REQUESTS || rt.routing.providerName === 'openrouteservice'
            ? () => Number(process.env.PUBLIC_NEARBY_DAILY_REQUESTS ?? 0)
            : undefined,
        budgetKey: `${rt.routing.providerName}:public`,
        rejectWhenBusy: true,
      },
    )
    this.service = new NearbyLiveService(
      rt.db,
      new PostgisLiveQuery(),
      publicRouting,
      () => rt.settings.get(),
      async (ids) => (await towTrucks.getCardsByIds(ids)) as unknown as { id: number }[],
      async (lat, lng, skip) => (await nearest.findNearest(lat, lng, skip)) as never,
      { enabled: rt.config.liveNearbyEnabled, cacheTtlMs: 60_000, cacheMax: 500 },
    )
  }
}

/** POST, not GET: a visitor's position must not land in nginx's access log (docs/nearest-search.md) */
@Controller('nearest-tow-trucks')
@UseFilters(DispatchErrorFilter)
export class NearbyLiveController {
  constructor(private readonly provider: NearbyLiveProvider) {}

  @Post('live')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  search(@Body() body: { latitude?: unknown; longitude?: unknown; skipRouting?: unknown }) {
    return this.provider.service.search(Number(body?.latitude), Number(body?.longitude), body?.skipRouting === true)
  }
}

/** Attaches the WebSocket endpoint to Nest's HTTP server */
@Injectable()
export class RealtimeGatewayHost implements OnApplicationBootstrap, OnApplicationShutdown {
  private gateway: RealtimeGateway | null = null

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly holder: LiveDispatchRuntimeHolder,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server
    const rt = this.holder.runtime
    this.gateway = new RealtimeGateway(server, rt.bus, {
      path: '/api/v1/realtime',
      authenticate: async (token, role) => {
        if (role === 'driver') {
          const id = await verifyDriverAppToken(this.jwt, this.config.getOrThrow<string>('driverJwtSecret'), this.holder, token)
          return {
            audience: `driver:${id.driverId}`,
            stillValid: async () => {
              const session = await rt.fleet.findSession(id.sessionId)
              return Boolean(session && !session.revokedAt)
            },
            onAck: async (offerId) => rt.offers.acknowledgeDelivery(offerId, id.driverId, 'REALTIME', await rt.settings.get()),
          }
        }
        const ops = await verifyOpsToken(this.jwt, this.config.getOrThrow<string>('adminJwtSecret'), token)
        if (!(await adminSessionStillValid(this.prisma, ops.adminUserId, ops.role))) return null
        return { audience: 'admin', stillValid: () => adminSessionStillValid(this.prisma, ops.adminUserId, ops.role) }
      },
    })
  }

  onApplicationShutdown(): void {
    this.gateway?.close()
  }
}

@Module({
  imports: [
    DriverAuthModule,
    AdminAuthModule,
    TowTrucksModule,
    NearestModule,
    // The driver app's sign-up and profile pages reuse the website's own
    // services (2026-11). Direction unchanged: nothing outside this folder
    // imports from it, so it is still deletable with one line in app.module.ts.
    RegistrationModule,
    PrivacyConsentModule,
    MyTowTruckModule,
    ProfileChangesModule,
    SubscriptionsModule,
    // The driver wallet's top-ups are Idram bills (2026-11-12): the form, and
    // the registry this module hands its WALLET_TOPUP handler to.
    IdramModule,
    // "I want to be on the website too" from the app's profile (2026-11-12)
    SiteListingModule,
  ],
  controllers: [DriverAppController, OpsDispatchController, NearbyLiveController],
  providers: [
    LiveDispatchRuntimeHolder,
    DriverAppGuard,
    DriverAppSiteProfileGuard,
    OpsGuard,
    NearbyLiveProvider,
    RealtimeGatewayHost,
    WalletPaymentsRegistrar,
    WalletPayLinks,
  ],
})
export class LiveDispatchModule {}

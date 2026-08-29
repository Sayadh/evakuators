import { Injectable, Logger } from '@nestjs/common'
import { armeniaDateTimeLabel } from '../common/armenia-day'
import { AdminTelegramService } from './admin-telegram.service'
import { AdminUserRepository } from './admin-user.repository'

export interface NewRegistrationNotice {
  firstName: string
  lastName: string
  phone: string
  vehicleBrand: string
  vehicleModel?: string | null
}

export interface NewFreeRouteNotice {
  driverName: string
  companyName: string | null
  phone: string
  startRegionSlug: string
  startCitySlug: string
  endRegionSlug: string
  endCitySlug: string
  departureAt: Date
}

/**
 * Broadcasts admin-facing Telegram notifications (currently just "new
 * registration request") to every admin who has linked their Telegram.
 * Best-effort by design — a Telegram hiccup here must never fail the
 * caller's actual operation (e.g. a driver's registration submission).
 */
@Injectable()
export class AdminNotificationService {
  private readonly logger = new Logger(AdminNotificationService.name)

  constructor(
    private readonly adminUserRepository: AdminUserRepository,
    private readonly telegram: AdminTelegramService,
  ) {}

  async notifyNewRegistration(request: NewRegistrationNotice): Promise<void> {
    if (!this.telegram.isConfigured) return

    const admins = await this.adminUserRepository.findAllWithTelegramLinked()
    if (admins.length === 0) return

    // No geography here on purpose — the backend never resolves location
    // slugs to names (see CLAUDE.md); the admin panel link is enough to see
    // full details, this message is just a heads-up.
    const vehicle = request.vehicleModel
      ? `${request.vehicleBrand} ${request.vehicleModel}`
      : request.vehicleBrand
    const text =
      '🆕 Նոր գրանցման հայտ Evakuators.am-ում\n\n' +
      `${request.firstName} ${request.lastName}\n` +
      `Հեռ.՝ ${request.phone}\n` +
      `${vehicle}`

    await Promise.all(
      admins.map((admin) =>
        this.telegram
          .sendMessage(admin.telegramChatId as bigint, text, {
            text: 'Բացել admin վահանակը',
            url: this.telegram.adminPanelUrl,
          })
          .catch((error) => {
            this.logger.warn(`Failed to notify admin #${admin.id} of new registration: ${String(error)}`)
          }),
      ),
    )
  }

  /**
   * Fires when a driver posts a new free route (FreeRoutesService.create() —
   * never on the reactivate-on-edit path, so an admin isn't paged for a typo
   * fix). Mirrors notifyNewRegistration in every respect that matters:
   * best-effort per admin, no geography resolution (the backend only ever
   * sees slugs — see CLAUDE.md), a button instead of trying to cram the
   * route into a lock-screen-sized line.
   */
  async notifyNewFreeRoute(route: NewFreeRouteNotice): Promise<void> {
    if (!this.telegram.isConfigured) return

    const admins = await this.adminUserRepository.findAllWithTelegramLinked()
    if (admins.length === 0) return

    const driver = route.companyName ? `${route.driverName} (${route.companyName})` : route.driverName
    const text =
      '🚚 Նոր ազատ երթուղի Evakuators.am-ում\n\n' +
      `${driver}\n` +
      `Հեռ.՝ ${route.phone}\n` +
      `${route.startRegionSlug}/${route.startCitySlug} → ${route.endRegionSlug}/${route.endCitySlug}\n` +
      `Մեկնում՝ ${armeniaDateTimeLabel(route.departureAt)}`

    await Promise.all(
      admins.map((admin) =>
        this.telegram
          .sendMessage(admin.telegramChatId as bigint, text, {
            text: 'Տեսնել ազատ երթուղիները',
            url: `${this.telegram.frontendUrl}/free-routes`,
          })
          .catch((error) => {
            this.logger.warn(`Failed to notify admin #${admin.id} of new free route: ${String(error)}`)
          }),
      ),
    )
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { AdminTelegramService } from './admin-telegram.service'
import { AdminUserRepository } from './admin-user.repository'

export interface NewRegistrationNotice {
  firstName: string
  lastName: string
  phone: string
  vehicleBrand: string
  vehicleModel?: string | null
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
}

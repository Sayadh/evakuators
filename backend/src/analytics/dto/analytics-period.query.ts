import { IsEnum, IsOptional } from 'class-validator'
import { ANALYTICS_DEFAULT_PERIOD } from '../analytics.constants'
import { AnalyticsPeriod } from '../analytics.enums'

/**
 * `?period=` for every dashboard read. Shared by the driver and admin
 * controllers — the query contract is identical, only the authorisation
 * differs, so there is no reason for two copies of it.
 *
 * An unknown value is a 400 rather than a silent fallback to the default:
 * a dashboard quietly showing 30 days when the user asked for 90 is worse
 * than an error.
 */
export class AnalyticsPeriodQuery {
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period: AnalyticsPeriod = ANALYTICS_DEFAULT_PERIOD
}

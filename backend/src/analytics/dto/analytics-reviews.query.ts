import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator'
import {
  ANALYTICS_REVIEWS_DEFAULT_LIMIT,
  ANALYTICS_REVIEWS_MAX_LIMIT,
} from '../analytics.constants'
import { AnalyticsReviewStatus } from '../analytics.enums'

/**
 * `?status=&limit=` for the dashboard review list.
 *
 * `limit` is capped by a constant rather than left open — this is a
 * driver-authenticated endpoint, but "authenticated" is not "trusted with an
 * unbounded query". The implicit-conversion ValidationPipe in main.ts turns the
 * query string into a real number before @IsInt() runs.
 */
export class AnalyticsReviewsQuery {
  @IsOptional()
  @IsEnum(AnalyticsReviewStatus)
  status: AnalyticsReviewStatus = AnalyticsReviewStatus.All

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(ANALYTICS_REVIEWS_MAX_LIMIT)
  limit: number = ANALYTICS_REVIEWS_DEFAULT_LIMIT
}

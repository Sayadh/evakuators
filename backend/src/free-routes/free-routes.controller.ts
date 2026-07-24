import { Controller, Get } from '@nestjs/common'
import type { FreeRouteApi } from './free-route.types'
import { FreeRoutesService } from './free-routes.service'

/** Public — anonymous customers browsing "Ազատ երթուղիներ" */
@Controller('free-routes')
export class FreeRoutesController {
  constructor(private readonly freeRoutesService: FreeRoutesService) {}

  @Get()
  list(): Promise<FreeRouteApi[]> {
    return this.freeRoutesService.listPublic()
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import { AuthenticatedDriverRequest, DriverJwtGuard } from '../driver-auth/driver-jwt.guard'
import { CreateFreeRouteDto } from './dto/create-free-route.dto'
import { UpdateFreeRouteDto } from './dto/update-free-route.dto'
import type { MyFreeRouteApi } from './free-route.types'
import { FreeRoutesService } from './free-routes.service'

/** Driver self-service — every route here only ever touches the caller's own free routes */
@Controller('my/free-routes')
@UseGuards(DriverJwtGuard)
export class MyFreeRoutesController {
  constructor(private readonly freeRoutesService: FreeRoutesService) {}

  @Get()
  listMine(@Req() request: AuthenticatedDriverRequest): Promise<MyFreeRouteApi[]> {
    return this.freeRoutesService.listMine(request.towTruckId)
  }

  @Post()
  create(
    @Req() request: AuthenticatedDriverRequest,
    @Body() dto: CreateFreeRouteDto,
  ): Promise<MyFreeRouteApi> {
    return this.freeRoutesService.create(request.towTruckId, dto)
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedDriverRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFreeRouteDto,
  ): Promise<MyFreeRouteApi> {
    return this.freeRoutesService.update(request.towTruckId, id, dto)
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedDriverRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ id: number }> {
    return this.freeRoutesService.remove(request.towTruckId, id)
  }
}

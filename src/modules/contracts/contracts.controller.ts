import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { ContractsService } from './contracts.service';
import { CreateLegacyContractDto } from './dto/create-legacy-contract.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('legacy')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_CONTRACT)
  @ApiBearerAuth()
  createLegacy(@Body() createDto: CreateLegacyContractDto, @RequestUser() user: User) {
    return this.contractsService.createLegacy(createDto, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_CONTRACTS)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.contractsService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_CONTRACTS)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.contractsService.get(id);
  }
}

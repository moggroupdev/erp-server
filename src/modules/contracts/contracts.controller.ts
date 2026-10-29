import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { ContractsService } from './contracts.service';
import { CreateLegacyContractDto } from './dto/create-legacy-contract.dto';
import { UpdateLegacyContractDto } from './dto/update-legacy-contract.dto';
import { ValidateLegacyContractDto } from './dto/validate-legacy-contract.dto';
import { ValidateLegacyContractItemsDto } from './dto/validate-legacy-contract-items.dto';
import {
  ValidateLegacyContractUnitsDto,
  ValidateUpdateLegacyContractUnitsDto,
} from './dto/validate-legacy-contract-units.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post('legacy/validate-contract')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_CONTRACT)
  @ApiBearerAuth()
  validateLegacyContract(@Body() dto: ValidateLegacyContractDto) {
    return this.contractsService.validateLegacyContract(dto);
  }

  @Post('legacy/validate-items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_CONTRACT)
  @ApiBearerAuth()
  validateLegacyItems(@Body() dto: ValidateLegacyContractItemsDto) {
    return this.contractsService.validateLegacyItems(dto);
  }

  @Post('legacy/validate-units')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_CONTRACT)
  @ApiBearerAuth()
  validateLegacyUnits(@Body() dto: ValidateLegacyContractUnitsDto) {
    return this.contractsService.validateLegacyUnits(dto);
  }

  @Post('legacy')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_CONTRACT)
  @ApiBearerAuth()
  createLegacy(@Body() createDto: CreateLegacyContractDto, @RequestUser() user: User) {
    return this.contractsService.createLegacy(createDto, user);
  }

  @Post('legacy/:id/validate-contract')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_CONTRACT)
  @ApiBearerAuth()
  validateLegacyContractForUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateLegacyContractDto,
  ) {
    return this.contractsService.validateLegacyContract({ ...dto, contractId: id });
  }

  @Post('legacy/:id/validate-items')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_CONTRACT)
  @ApiBearerAuth()
  validateLegacyItemsForUpdate(@Body() dto: ValidateLegacyContractItemsDto) {
    return this.contractsService.validateLegacyItems(dto);
  }

  @Post('legacy/:id/validate-units')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_CONTRACT)
  @ApiBearerAuth()
  validateLegacyUnitsForUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ValidateUpdateLegacyContractUnitsDto,
  ) {
    return this.contractsService.validateLegacyUnits({ ...dto, contractId: id });
  }

  @Patch('legacy/:id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_LEGACY_CONTRACT)
  @ApiBearerAuth()
  updateLegacy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateLegacyContractDto,
    @RequestUser() user: User,
  ) {
    return this.contractsService.updateLegacy(id, updateDto, user);
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

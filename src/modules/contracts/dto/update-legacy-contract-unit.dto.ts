import { IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';
import { CreateLegacyContractUnitDto } from './create-legacy-contract-unit.dto';

export class UpdateLegacyContractUnitDto extends CreateLegacyContractUnitDto {
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  id?: string;
}

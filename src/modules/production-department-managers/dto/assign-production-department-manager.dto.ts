import { IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUuidString } from 'src/utils/decorators';

export class AssignProductionDepartmentManagerDto {
  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  managerId: string | null;

  @IsUuidString()
  @IsOptional()
  @ApiPropertyOptional()
  deputyManagerId: string | null;
}

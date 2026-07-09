import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateDepartmentDto } from './create-department.dto';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  managerId: string | null;
}

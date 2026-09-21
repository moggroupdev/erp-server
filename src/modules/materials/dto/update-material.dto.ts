import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateMaterialDto } from './create-material.dto';

export class UpdateMaterialDto extends PartialType(OmitType(CreateMaterialDto, ['materialType'] as const)) {}

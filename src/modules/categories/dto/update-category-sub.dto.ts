import { PartialType } from '@nestjs/swagger';
import { CreateCategorySubDto } from './create-category-sub.dto';

export class UpdateCategorySubDto extends PartialType(CreateCategorySubDto) {}

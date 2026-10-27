import { PartialType } from '@nestjs/swagger';
import { CreateCategoryMainDto } from './create-category-main.dto';

export class UpdateCategoryMainDto extends PartialType(CreateCategoryMainDto) {}

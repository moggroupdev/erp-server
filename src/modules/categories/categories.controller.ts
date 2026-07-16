import { Controller, Get } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  getCategories() {
    return this.categoriesService.getCategories();
  }

  @Get('material-category-mains')
  getMaterialCategoryMains() {
    return this.categoriesService.getMaterialCategoryMains();
  }

  @Get('material-category-subs')
  getMaterialCategorySubs() {
    return this.categoriesService.getMaterialCategorySubs();
  }

  @Get('product-category-mains')
  getProductCategoryMains() {
    return this.categoriesService.getProductCategoryMains();
  }

  @Get('product-category-subs')
  getProductCategorySubs() {
    return this.categoriesService.getProductCategorySubs();
  }
}

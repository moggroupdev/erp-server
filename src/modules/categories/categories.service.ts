import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  public async getAllCategories() {
    const [materialCategoryMains, materialCategorySubs, productCategoryMains, productCategorySubs] = await Promise.all([
      this.getMaterialCategoryMains(),
      this.getMaterialCategorySubs(),
      this.getProductCategoryMains(),
      this.getProductCategorySubs(),
    ]);

    return { materialCategoryMains, materialCategorySubs, productCategoryMains, productCategorySubs };
  }

  public async getMaterialCategories() {
    const [materialCategoryMains, materialCategorySubs] = await Promise.all([
      this.getMaterialCategoryMains(),
      this.getMaterialCategorySubs(),
    ]);

    return { materialCategoryMains, materialCategorySubs };
  }

  public async getProductCategories() {
    const [productCategoryMains, productCategorySubs] = await Promise.all([
      this.getProductCategoryMains(),
      this.getProductCategorySubs(),
    ]);

    return { productCategoryMains, productCategorySubs };
  }

  public async getMaterialCategoryMains() {
    return this.db.query.materialCategoryMains.findMany();
  }

  public async getMaterialCategorySubs() {
    return this.db.query.materialCategorySubs.findMany();
  }

  public async getProductCategoryMains() {
    return this.db.query.productCategoryMains.findMany();
  }

  public async getProductCategorySubs() {
    return this.db.query.productCategorySubs.findMany();
  }
}

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LocaleMiddleware } from './utils/middlewares/locale.middleware';
import { LoggerMiddleware } from './utils/middlewares/logger.middleware';
import { DatabaseModule } from './database/database.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { LocationsModule } from './modules/locations/locations.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { CustomersModule } from './modules/customers/customers.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { MmBomsModule } from './modules/mm-boms/mm-boms.module';
import { ProductsModule } from './modules/products/products.module';
import { BomsModule } from './modules/boms/boms.module';
import { InventoryTransactionsModule } from './modules/inventory-transactions/inventory-transactions.module';
import { MaterialPurchaseOrdersModule } from './modules/material-purchase-orders/material-purchase-orders.module';
import { LegacyIssuePermitsModule } from './modules/legacy-issue-permits/legacy-issue-permits.module';
import { ReportsModule } from './modules/reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    DepartmentsModule,
    LocationsModule,
    RolesModule,
    UsersModule,
    SuppliersModule,
    CustomersModule,
    CategoriesModule,
    MaterialsModule,
    MmBomsModule,
    ProductsModule,
    BomsModule,
    InventoryTransactionsModule,
    MaterialPurchaseOrdersModule,
    LegacyIssuePermitsModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocaleMiddleware, LoggerMiddleware).forRoutes('*');
  }
}

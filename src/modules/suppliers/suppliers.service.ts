import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { supplierAddresses, suppliers } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateAddressDto } from 'src/utils/dto/create-address.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createSupplierDto: CreateSupplierDto, user: User) {
    const [supplier] = await this.db
      .insert(suppliers)
      .values({ ...createSupplierDto, code: sql`DEFAULT`, createdBy: user.id })
      .returning();
    return supplier;
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(suppliers, queryParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      additionalConditions: [isNull(suppliers.deletedAt)],
    });
  }

  // We allow the `get` method to return a deleted supplier too
  public async get(id: string) {
    const supplier = await this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, id),
      with: { createdBy: { columns: { id: true, name: true } } },
    });
    if (!supplier)
      throw new NotFoundException(translate(`Supplier with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return supplier;
  }

  public async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    const [updatedSupplier] = await this.db
      .update(suppliers)
      .set(updateSupplierDto)
      .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
      .returning();
    if (!updatedSupplier)
      throw new NotFoundException(translate(`Supplier with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return updatedSupplier;
  }

  // ========================= Addresses =========================

  public async addAddress(supplierId: string, createSupplierAddressDto: CreateAddressDto) {
    const { isDefault, ...addressData } = createSupplierAddressDto;

    return await this.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(supplierAddresses)
          .set({ isDefault: false })
          .where(and(eq(supplierAddresses.supplierId, supplierId), eq(supplierAddresses.isDefault, true)));
      }

      const [address] = await tx
        .insert(supplierAddresses)
        .values({ ...addressData, supplierId, isDefault: isDefault || false })
        .returning();

      return address;
    });
  }

  public async listAddresses(supplierId: string) {
    return await this.db.query.supplierAddresses.findMany({
      where: eq(supplierAddresses.supplierId, supplierId),
      orderBy: desc(supplierAddresses.isDefault),
    });
  }

  public async setDefaultAddress(supplierId: string, addressId: string) {
    const address = await this.db.query.supplierAddresses.findFirst({
      where: and(eq(supplierAddresses.id, addressId), eq(supplierAddresses.supplierId, supplierId)),
    });

    if (!address)
      throw new NotFoundException(
        translate(
          `Address with ID ${addressId} does not exist for supplier ${supplierId}.`,
          `لا يوجد عنوان بالمعرف ${addressId} للمورد ${supplierId}.`,
        ),
      );

    if (address.isDefault) return address;

    return await this.db.transaction(async (tx) => {
      await tx
        .update(supplierAddresses)
        .set({ isDefault: false })
        .where(and(eq(supplierAddresses.supplierId, supplierId), eq(supplierAddresses.isDefault, true)));

      const [updatedAddress] = await tx
        .update(supplierAddresses)
        .set({ isDefault: true })
        .where(eq(supplierAddresses.id, addressId))
        .returning();

      return updatedAddress;
    });
  }
}

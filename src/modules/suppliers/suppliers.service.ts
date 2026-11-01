import { and, desc, eq, exists, isNotNull, isNull, sql } from 'drizzle-orm';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  materialCategorySubs,
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materials,
  supplierAddresses,
  supplierContactPersons,
  suppliers,
} from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { CreateAddressDto } from 'src/utils/dto/create-address.dto';
import { CreateContactPersonDto } from 'src/utils/dto/create-contact-person.dto';
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
    const { mainCategoryId, blacklisted, ...listParams } = queryParams;
    const additionalConditions = [blacklisted === 'true' ? isNotNull(suppliers.blacklistedAt) : isNull(suppliers.blacklistedAt)];

    // Suppliers who have a non-cancelled purchase order for a material in this main category.
    if (typeof mainCategoryId === 'string' && mainCategoryId.length > 0) {
      additionalConditions.push(this.purchasedMainCategoryCondition(mainCategoryId));
    }

    return await this.queryBuilderService.execute(suppliers, listParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone', 'website', 'taxNumber', 'commercialRegistrationNumber'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      additionalConditions,
    });
  }

  private purchasedMainCategoryCondition(mainCategoryId: string) {
    return exists(
      this.db
        .select({ id: materialPurchaseOrders.id })
        .from(materialPurchaseOrders)
        .innerJoin(
          materialPurchaseOrderItems,
          eq(materialPurchaseOrderItems.materialPurchaseOrderId, materialPurchaseOrders.id),
        )
        .innerJoin(materials, eq(materialPurchaseOrderItems.materialCode, materials.code))
        .innerJoin(materialCategorySubs, eq(materials.subCategoryId, materialCategorySubs.id))
        .where(
          and(
            eq(materialPurchaseOrders.supplierId, suppliers.id),
            isNull(materialPurchaseOrders.cancelledAt),
            eq(materialCategorySubs.mainCategoryId, mainCategoryId),
          ),
        ),
    );
  }

  // We allow the `get` method to return a blacklisted supplier too
  public async get(id: string) {
    const supplier = await this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, id),
      with: {
        createdBy: { columns: { id: true, name: true } },
        addedToBlacklistBy: { columns: { id: true, name: true } },
      },
    });
    if (!supplier)
      throw new NotFoundException(translate(`Supplier with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return supplier;
  }

  public async update(id: string, updateSupplierDto: UpdateSupplierDto) {
    const [updatedSupplier] = await this.db
      .update(suppliers)
      .set(updateSupplierDto)
      .where(and(eq(suppliers.id, id), isNull(suppliers.blacklistedAt)))
      .returning();
    if (!updatedSupplier)
      throw new NotFoundException(translate(`Supplier with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return updatedSupplier;
  }

  public async addToBlacklist(id: string, user: User) {
    const [updatedSupplier] = await this.db
      .update(suppliers)
      .set({ blacklistedAt: new Date(), addedToBlacklistBy: user.id })
      .where(and(eq(suppliers.id, id), isNull(suppliers.blacklistedAt)))
      .returning();

    if (!updatedSupplier) {
      const supplier = await this.db.query.suppliers.findFirst({ where: eq(suppliers.id, id), columns: { id: true } });
      if (!supplier)
        throw new NotFoundException(translate(`Supplier with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
      throw new ConflictException(translate('This supplier is already blacklisted.', 'هذا المورد مدرج في القائمة السوداء بالفعل.'));
    }

    return updatedSupplier;
  }

  public async removeFromBlacklist(id: string) {
    const [updatedSupplier] = await this.db
      .update(suppliers)
      .set({ blacklistedAt: null, addedToBlacklistBy: null })
      .where(and(eq(suppliers.id, id), isNotNull(suppliers.blacklistedAt)))
      .returning();

    if (!updatedSupplier) {
      const supplier = await this.db.query.suppliers.findFirst({ where: eq(suppliers.id, id), columns: { id: true } });
      if (!supplier)
        throw new NotFoundException(translate(`Supplier with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
      throw new ConflictException(translate('This supplier is not blacklisted.', 'هذا المورد غير مدرج في القائمة السوداء.'));
    }

    return updatedSupplier;
  }

  // ========================= Addresses =========================

  public async addAddress(supplierId: string, createSupplierAddressDto: CreateAddressDto) {
    await this.assertActiveSupplier(supplierId);
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
    await this.assertActiveSupplier(supplierId);
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

  // ========================= Contact persons =========================

  public async addContactPerson(supplierId: string, createContactPersonDto: CreateContactPersonDto) {
    await this.assertActiveSupplier(supplierId);
    const { isPrimary, ...contactData } = createContactPersonDto;

    return await this.db.transaction(async (tx) => {
      if (isPrimary) {
        await tx
          .update(supplierContactPersons)
          .set({ isPrimary: false })
          .where(and(eq(supplierContactPersons.supplierId, supplierId), eq(supplierContactPersons.isPrimary, true)));
      }

      const [contactPerson] = await tx
        .insert(supplierContactPersons)
        .values({ ...contactData, supplierId, isPrimary: isPrimary || false })
        .returning();

      return contactPerson;
    });
  }

  public async listContactPersons(supplierId: string) {
    return await this.db.query.supplierContactPersons.findMany({
      where: eq(supplierContactPersons.supplierId, supplierId),
      orderBy: desc(supplierContactPersons.isPrimary),
    });
  }

  public async setPrimaryContactPerson(supplierId: string, contactPersonId: string) {
    await this.assertActiveSupplier(supplierId);
    const contactPerson = await this.db.query.supplierContactPersons.findFirst({
      where: and(eq(supplierContactPersons.id, contactPersonId), eq(supplierContactPersons.supplierId, supplierId)),
    });

    if (!contactPerson)
      throw new NotFoundException(
        translate(
          `Contact person with ID ${contactPersonId} does not exist for supplier ${supplierId}.`,
          `لا يوجد شخص اتصال بالمعرف ${contactPersonId} للمورد ${supplierId}.`,
        ),
      );

    if (contactPerson.isPrimary) return contactPerson;

    return await this.db.transaction(async (tx) => {
      await tx
        .update(supplierContactPersons)
        .set({ isPrimary: false })
        .where(and(eq(supplierContactPersons.supplierId, supplierId), eq(supplierContactPersons.isPrimary, true)));

      const [updatedContactPerson] = await tx
        .update(supplierContactPersons)
        .set({ isPrimary: true })
        .where(eq(supplierContactPersons.id, contactPersonId))
        .returning();

      return updatedContactPerson;
    });
  }

  private async assertActiveSupplier(supplierId: string) {
    const supplier = await this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, supplierId),
      columns: { id: true, blacklistedAt: true },
    });
    if (!supplier)
      throw new NotFoundException(
        translate(`Supplier with ID ${supplierId} does not exist.`, `لا يوجد مورد بالمعرف ${supplierId}.`),
      );
    if (supplier.blacklistedAt)
      throw new ConflictException(
        translate('This supplier is blacklisted and cannot be edited.', 'هذا المورد مدرج في القائمة السوداء ولا يمكن تعديله.'),
      );
  }
}

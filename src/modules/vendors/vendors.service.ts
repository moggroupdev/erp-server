import { and, eq, isNull, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { vendorAddresses, vendors } from 'src/database/schema';
import { Vendor, QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CreateVendorAddressDto } from './dto/create-vendor-address.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

const POPULATION = { createdBy: { columns: { id: true, name: true } } };

@Injectable()
export class VendorsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createVendorDto: CreateVendorDto, user: User) {
    const [vendor] = await this.db
      .insert(vendors)
      .values({ ...createVendorDto, code: sql`DEFAULT`, createdBy: user.id })
      .returning();
    return this.get(vendor.id); // Returns the vendor with population
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute<Vendor>(vendors, queryParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: POPULATION,
      additionalConditions: [isNull(vendors.deletedAt)],
    });
  }

  // We allow the `get` method to return a deleted vendor too
  public async get(id: string) {
    const vendor = await this.db.query.vendors.findFirst({ where: eq(vendors.id, id), with: POPULATION });
    if (!vendor)
      throw new NotFoundException(translate(`Vendor with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return vendor;
  }

  public async update(id: string, updateVendorDto: UpdateVendorDto) {
    const [updatedVendor] = await this.db
      .update(vendors)
      .set(updateVendorDto)
      .where(and(eq(vendors.id, id), isNull(vendors.deletedAt)))
      .returning();
    if (!updatedVendor)
      throw new NotFoundException(translate(`Vendor with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return this.get(updatedVendor.id); // Returns the updated vendor with population
  }

  public async addAddress(vendorId: string, createVendorAddressDto: CreateVendorAddressDto) {
    const { isDefault, ...addressData } = createVendorAddressDto;

    return await this.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(vendorAddresses)
          .set({ isDefault: false })
          .where(and(eq(vendorAddresses.vendorId, vendorId), eq(vendorAddresses.isDefault, true)));
      }

      const [address] = await tx
        .insert(vendorAddresses)
        .values({ ...addressData, vendorId, isDefault: isDefault || false })
        .returning();

      return address;
    });
  }

  public async getAddresses(vendorId: string) {
    return await this.db.query.vendorAddresses.findMany({
      where: eq(vendorAddresses.vendorId, vendorId),
    });
  }

  public async setDefaultAddress(vendorId: string, addressId: string) {
    const address = await this.db.query.vendorAddresses.findFirst({
      where: and(eq(vendorAddresses.id, addressId), eq(vendorAddresses.vendorId, vendorId)),
    });

    if (!address)
      throw new NotFoundException(
        translate(
          `Address with ID ${addressId} does not exist for vendor ${vendorId}.`,
          `لا يوجد عنوان بالمعرف ${addressId} للمورد ${vendorId}.`,
        ),
      );

    if (address.isDefault) return address;

    return await this.db.transaction(async (tx) => {
      await tx
        .update(vendorAddresses)
        .set({ isDefault: false })
        .where(and(eq(vendorAddresses.vendorId, vendorId), eq(vendorAddresses.isDefault, true)));

      const [updatedAddress] = await tx
        .update(vendorAddresses)
        .set({ isDefault: true })
        .where(eq(vendorAddresses.id, addressId))
        .returning();

      return updatedAddress;
    });
  }
}

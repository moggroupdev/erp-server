import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { customerAddresses, customerContactPersons, customers } from 'src/database/schema';
import { QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateAddressDto } from 'src/utils/dto/create-address.dto';
import { CreateContactPersonDto } from 'src/utils/dto/create-contact-person.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async create(createCustomerDto: CreateCustomerDto, user: User) {
    const [customer] = await this.db
      .insert(customers)
      .values({ ...createCustomerDto, code: sql`DEFAULT`, createdBy: user.id })
      .returning();
    return customer;
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(customers, queryParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone', 'website', 'taxNumber', 'commercialRegistrationNumber'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      additionalConditions: [isNull(customers.blacklistedAt)],
    });
  }

  // We allow the `get` method to return a blacklisted customer too
  public async get(id: string) {
    const customer = await this.db.query.customers.findFirst({
      where: eq(customers.id, id),
      with: {
        createdBy: { columns: { id: true, name: true } },
        addedToBlacklistBy: { columns: { id: true, name: true } },
      },
    });
    if (!customer)
      throw new NotFoundException(translate(`Customer with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return customer;
  }

  public async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    const [updatedCustomer] = await this.db
      .update(customers)
      .set(updateCustomerDto)
      .where(and(eq(customers.id, id), isNull(customers.blacklistedAt)))
      .returning();
    if (!updatedCustomer)
      throw new NotFoundException(translate(`Customer with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return updatedCustomer;
  }

  // ========================= Addresses =========================

  public async addAddress(customerId: string, createCustomerAddressDto: CreateAddressDto) {
    const { isDefault, ...addressData } = createCustomerAddressDto;

    return await this.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(customerAddresses)
          .set({ isDefault: false })
          .where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.isDefault, true)));
      }

      const [address] = await tx
        .insert(customerAddresses)
        .values({ ...addressData, customerId, isDefault: isDefault || false })
        .returning();

      return address;
    });
  }

  public async listAddresses(customerId: string) {
    return await this.db.query.customerAddresses.findMany({
      where: eq(customerAddresses.customerId, customerId),
      orderBy: desc(customerAddresses.isDefault),
    });
  }

  public async setDefaultAddress(customerId: string, addressId: string) {
    const address = await this.db.query.customerAddresses.findFirst({
      where: and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)),
    });

    if (!address)
      throw new NotFoundException(
        translate(
          `Address with ID ${addressId} does not exist for customer ${customerId}.`,
          `لا يوجد عنوان بالمعرف ${addressId} للمورد ${customerId}.`,
        ),
      );

    if (address.isDefault) return address;

    return await this.db.transaction(async (tx) => {
      await tx
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.isDefault, true)));

      const [updatedAddress] = await tx
        .update(customerAddresses)
        .set({ isDefault: true })
        .where(eq(customerAddresses.id, addressId))
        .returning();

      return updatedAddress;
    });
  }

  // ========================= Contact persons =========================

  public async addContactPerson(customerId: string, createContactPersonDto: CreateContactPersonDto) {
    const { isPrimary, ...contactData } = createContactPersonDto;

    return await this.db.transaction(async (tx) => {
      if (isPrimary) {
        await tx
          .update(customerContactPersons)
          .set({ isPrimary: false })
          .where(and(eq(customerContactPersons.customerId, customerId), eq(customerContactPersons.isPrimary, true)));
      }

      const [contactPerson] = await tx
        .insert(customerContactPersons)
        .values({ ...contactData, customerId, isPrimary: isPrimary || false })
        .returning();

      return contactPerson;
    });
  }

  public async listContactPersons(customerId: string) {
    return await this.db.query.customerContactPersons.findMany({
      where: eq(customerContactPersons.customerId, customerId),
      orderBy: desc(customerContactPersons.isPrimary),
    });
  }

  public async setPrimaryContactPerson(customerId: string, contactPersonId: string) {
    const contactPerson = await this.db.query.customerContactPersons.findFirst({
      where: and(eq(customerContactPersons.id, contactPersonId), eq(customerContactPersons.customerId, customerId)),
    });

    if (!contactPerson)
      throw new NotFoundException(
        translate(
          `Contact person with ID ${contactPersonId} does not exist for customer ${customerId}.`,
          `لا يوجد شخص اتصال بالمعرف ${contactPersonId} للعميل ${customerId}.`,
        ),
      );

    if (contactPerson.isPrimary) return contactPerson;

    return await this.db.transaction(async (tx) => {
      await tx
        .update(customerContactPersons)
        .set({ isPrimary: false })
        .where(and(eq(customerContactPersons.customerId, customerId), eq(customerContactPersons.isPrimary, true)));

      const [updatedContactPerson] = await tx
        .update(customerContactPersons)
        .set({ isPrimary: true })
        .where(eq(customerContactPersons.id, contactPersonId))
        .returning();

      return updatedContactPerson;
    });
  }
}

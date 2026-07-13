import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { customerAddresses, customers } from 'src/database/schema';
import { Customer, QueryParams, User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const POPULATION = { createdBy: { columns: { id: true, name: true } } };

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
    return this.get(customer.id); // Returns the customer with population
  }

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute<Customer>(customers, queryParams, {
      filtering: true,
      searchableFields: ['name', 'code', 'email', 'phone'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: POPULATION,
      additionalConditions: [isNull(customers.deletedAt)],
    });
  }

  // We allow the `get` method to return a deleted customer too
  public async get(id: string) {
    const customer = await this.db.query.customers.findFirst({ where: eq(customers.id, id), with: POPULATION });
    if (!customer)
      throw new NotFoundException(translate(`Customer with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return customer;
  }

  public async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    const [updatedCustomer] = await this.db
      .update(customers)
      .set(updateCustomerDto)
      .where(and(eq(customers.id, id), isNull(customers.deletedAt)))
      .returning();
    if (!updatedCustomer)
      throw new NotFoundException(translate(`Customer with ID ${id} does not exist.`, `لا يوجد مورد بالمعرف ${id}.`));
    return this.get(updatedCustomer.id); // Returns the updated customer with population
  }

  // ========================= Addresses =========================

  public async addAddress(customerId: string, createCustomerAddressDto: CreateCustomerAddressDto) {
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
}

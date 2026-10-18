import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  contractItems,
  contracts,
  customerAddresses,
  customers,
  productDimensions,
  productUnits,
  products,
} from 'src/database/schema';
import { PRODUCT_SOURCE_TYPES } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { type QueryParams, type User } from 'src/utils/types';
import { CreateLegacyContractDto } from './dto/create-legacy-contract.dto';
import { CreateLegacyContractItemDto } from './dto/create-legacy-contract-item.dto';
import { ValidateLegacyContractDto } from './dto/validate-legacy-contract.dto';
import { ValidateLegacyContractItemsDto } from './dto/validate-legacy-contract-items.dto';
import { ValidateLegacyContractUnitsDto } from './dto/validate-legacy-contract-units.dto';

const USER_COLUMNS = { id: true, name: true } as const;
const CUSTOMER_COLUMNS = { id: true, code: true, name: true } as const;

function toNumber(value: string | number): number {
  return Number(value);
}

function toNullableNumber(value: string | number | null): number | null {
  return value == null ? null : Number(value);
}

function firstDuplicate(values: string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

@Injectable()
export class ContractsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async list(queryParams: QueryParams) {
    const status = typeof queryParams.status === 'string' ? queryParams.status : undefined;
    const statusCondition = this.statusCondition(status);

    const listed = await this.queryBuilderService.execute(contracts, queryParams, {
      filtering: true,
      searchableFields: ['code', 'legacyNumber', 'legacyWorkOrderNumber', 'notes'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      additionalConditions: statusCondition ? [statusCondition] : undefined,
      withRelations: {
        customer: { columns: CUSTOMER_COLUMNS },
        createdBy: { columns: USER_COLUMNS },
      },
    });

    return {
      ...listed,
      data: listed.data.map((row) => ({
        ...row,
        totalAmount: row.totalAmount == null ? row.totalAmount : toNumber(row.totalAmount),
      })),
    };
  }

  public async get(id: string) {
    const contract = await this.db.query.contracts.findFirst({
      where: eq(contracts.id, id),
      with: {
        customer: { columns: CUSTOMER_COLUMNS },
        deliveryAddress: { columns: { id: true, addressLine: true, cityId: true, countryId: true } },
        createdBy: { columns: USER_COLUMNS },
        cancelledByUser: { columns: USER_COLUMNS },
        inquiry: { columns: { id: true, status: true } },
        preview: { columns: { id: true, scheduledAt: true } },
        offer: { columns: { id: true, status: true } },
        items: {
          with: {
            product: { columns: { code: true, title: true } },
            productDimension: {
              columns: { id: true, length: true, depth: true, diameter: true, height: true },
            },
            productUnits: {
              columns: {
                id: true,
                serialNumber: true,
                supplierSerialNumber: true,
                producedAt: true,
                receivedAt: true,
                deliveredAt: true,
                installedAt: true,
                warrantyStartedAt: true,
                notes: true,
                cancelledAt: true,
              },
            },
          },
        },
      },
    });

    if (!contract) {
      throw new NotFoundException(
        translate(`Contract review with ID ${id} does not exist.`, `لا توجد مراجعة عقد بالمعرف ${id}.`),
      );
    }

    return {
      ...contract,
      totalAmount: toNumber(contract.totalAmount),
      discountPct: toNullableNumber(contract.discountPct),
      items: contract.items.map((item) => ({
        ...item,
        unitPrice: toNumber(item.unitPrice),
        productDimension: {
          ...item.productDimension,
          length: toNullableNumber(item.productDimension.length),
          depth: toNullableNumber(item.productDimension.depth),
          diameter: toNullableNumber(item.productDimension.diameter),
          height: toNumber(item.productDimension.height),
        },
      })),
    };
  }

  public async validateLegacyContract(dto: ValidateLegacyContractDto) {
    await this.assertLegacyContractHeader(dto);
    return { ok: true as const };
  }

  public async validateLegacyItems(dto: ValidateLegacyContractItemsDto) {
    await this.loadLegacyItemProducts(dto.items.map((item) => item.productDimensionId));
    return { ok: true as const };
  }

  public async validateLegacyUnits(dto: ValidateLegacyContractUnitsDto) {
    const { serials, supplierSerials } = await this.assertLegacyContractItems(dto.items);
    await this.assertSerialsAvailable(serials, supplierSerials);
    return { ok: true as const };
  }

  public async createLegacy(dto: CreateLegacyContractDto, user: User) {
    await this.assertLegacyContractHeader(dto);
    const { dimensionById, productByCode, serials, supplierSerials } = await this.assertLegacyContractItems(dto.items);
    await this.assertSerialsAvailable(serials, supplierSerials);

    const totalAmount = dto.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return await this.db.transaction(async (tx) => {
      const [contract] = await tx
        .insert(contracts)
        .values({
          code: sql`DEFAULT`,
          customerId: dto.customerId,
          legacyNumber: dto.legacyNumber,
          legacyWorkOrderNumber: dto.legacyWorkOrderNumber,
          deliveryAddressId: dto.deliveryAddressId ?? null,
          deliveryTime: new Date(dto.deliveryTime),
          startedAt: new Date(dto.startedAt),
          createdAt: new Date(dto.createdAt),
          totalAmount,
          createdBy: user.id,
        })
        .returning();

      for (const item of dto.items) {
        const dimension = dimensionById.get(item.productDimensionId);
        if (!dimension) {
          throw new NotFoundException(
            translate(
              `Product dimension with ID ${item.productDimensionId} does not exist.`,
              `لا يوجد مقاس منتج بالمعرف ${item.productDimensionId}.`,
            ),
          );
        }
        const product = productByCode.get(dimension.productCode);
        const imported = product?.sourceType === PRODUCT_SOURCE_TYPES.IMPORTED;

        const [insertedItem] = await tx
          .insert(contractItems)
          .values({
            contractId: contract.id,
            productDimensionId: item.productDimensionId,
            productCode: dimension.productCode,
            title: item.title ?? null,
            notes: item.notes ?? null,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            createdBy: user.id,
          })
          .returning();

        await tx.insert(productUnits).values(
          item.units.map((unit) => ({
            serialNumber: unit.serialNumber,
            supplierSerialNumber: imported ? unit.supplierSerialNumber : null,
            contractItemId: insertedItem.id,
            producedAt: unit.producedAt ? new Date(unit.producedAt) : null,
            createdBy: user.id,
          })),
        );
      }

      return contract;
    });
  }

  private async assertLegacyContractHeader(dto: ValidateLegacyContractDto) {
    const customer = await this.db.query.customers.findFirst({
      where: eq(customers.id, dto.customerId),
      columns: { id: true },
    });
    if (!customer) {
      throw new NotFoundException(
        translate(`Customer with ID ${dto.customerId} does not exist.`, `لا يوجد عميل بالمعرف ${dto.customerId}.`),
      );
    }

    if (dto.deliveryAddressId) {
      const address = await this.db.query.customerAddresses.findFirst({
        where: and(eq(customerAddresses.id, dto.deliveryAddressId), eq(customerAddresses.customerId, dto.customerId)),
        columns: { id: true },
      });
      if (!address) {
        throw new BadRequestException(
          translate('Delivery address must belong to the selected customer.', 'يجب أن يتبع عنوان التسليم العميل المحدد.'),
        );
      }
    }

    const createdAt = new Date(dto.createdAt);
    const startedAt = new Date(dto.startedAt);
    const deliveryTime = new Date(dto.deliveryTime);
    if (Number.isNaN(createdAt.getTime()) || Number.isNaN(startedAt.getTime()) || Number.isNaN(deliveryTime.getTime())) {
      throw new BadRequestException(translate('One or more dates are invalid.', 'تاريخ واحد أو أكثر غير صالح.'));
    }
    if (startedAt < createdAt) {
      throw new BadRequestException(
        translate(
          'Work order start date cannot be earlier than the contract review date.',
          'لا يمكن أن يسبق تاريخ بدء أمر الشغل تاريخ مراجعة العقد.',
        ),
      );
    }
    if (deliveryTime < startedAt) {
      throw new BadRequestException(
        translate(
          'Delivery planned date cannot be earlier than the work order start date.',
          'لا يمكن أن يسبق تاريخ التسليم المخطط تاريخ بدء أمر الشغل.',
        ),
      );
    }

    const numberClashes = await this.db.query.contracts.findMany({
      where: or(
        eq(contracts.legacyNumber, dto.legacyNumber),
        eq(contracts.legacyWorkOrderNumber, dto.legacyWorkOrderNumber),
      ),
      columns: { legacyNumber: true, legacyWorkOrderNumber: true },
    });
    if (numberClashes.some((row) => row.legacyNumber === dto.legacyNumber)) {
      throw new ConflictException(
        translate(
          `Legacy contract review number ${dto.legacyNumber} is already used.`,
          `رقم مراجعة العقد ${dto.legacyNumber} مستخدم بالفعل.`,
        ),
      );
    }
    if (numberClashes.some((row) => row.legacyWorkOrderNumber === dto.legacyWorkOrderNumber)) {
      throw new ConflictException(
        translate(
          `Legacy work order number ${dto.legacyWorkOrderNumber} is already used.`,
          `رقم أمر الشغل ${dto.legacyWorkOrderNumber} مستخدم بالفعل.`,
        ),
      );
    }
  }

  private async loadLegacyItemProducts(dimensionIdsInput: string[]) {
    const dimensionIds = [...new Set(dimensionIdsInput)];
    const dimensions = await this.db.query.productDimensions.findMany({
      where: inArray(productDimensions.id, dimensionIds),
      columns: { id: true, productCode: true },
    });
    const dimensionById = new Map(dimensions.map((dimension) => [dimension.id, dimension]));

    for (const dimensionId of dimensionIds) {
      if (!dimensionById.has(dimensionId)) {
        throw new NotFoundException(
          translate(
            `Product dimension with ID ${dimensionId} does not exist.`,
            `لا يوجد مقاس منتج بالمعرف ${dimensionId}.`,
          ),
        );
      }
    }

    const productCodes = [...new Set(dimensions.map((dimension) => dimension.productCode))];
    const productRows =
      productCodes.length === 0
        ? []
        : await this.db.query.products.findMany({
            where: inArray(products.code, productCodes),
            columns: { code: true, sourceType: true, deletedAt: true },
          });
    const productByCode = new Map(productRows.map((product) => [product.code, product]));

    for (const dimension of dimensions) {
      const product = productByCode.get(dimension.productCode);
      if (!product || product.deletedAt) {
        throw new BadRequestException(
          translate(`Product ${dimension.productCode} is deleted.`, `المنتج ${dimension.productCode} محذوف.`),
        );
      }
    }

    return { dimensionById, productByCode };
  }

  private async assertLegacyContractItems(items: CreateLegacyContractItemDto[]) {
    const { dimensionById, productByCode } = await this.loadLegacyItemProducts(
      items.map((item) => item.productDimensionId),
    );

    const serials: string[] = [];
    const supplierSerials: string[] = [];

    items.forEach((item, index) => {
      const line = index + 1;
      if (item.units.length !== item.quantity) {
        throw new BadRequestException(
          translate(
            `Line ${line} must include one product unit for each unit of quantity.`,
            `يجب أن يتضمن البند ${line} وحدة منتج لكل وحدة من الكمية.`,
          ),
        );
      }

      const dimension = dimensionById.get(item.productDimensionId)!;
      const product = productByCode.get(dimension.productCode)!;
      const imported = product.sourceType === PRODUCT_SOURCE_TYPES.IMPORTED;

      for (const unit of item.units) {
        serials.push(unit.serialNumber);
        if (imported) {
          if (!unit.supplierSerialNumber) {
            throw new BadRequestException(
              translate(
                `Supplier serial number is required for imported product ${product.code}.`,
                `الرقم التسلسلي للمورد مطلوب للمنتج المستورد ${product.code}.`,
              ),
            );
          }
          supplierSerials.push(unit.supplierSerialNumber);
        } else if (unit.supplierSerialNumber) {
          throw new BadRequestException(
            translate(
              'Supplier serial number applies only to imported products.',
              'الرقم التسلسلي للمورد يخص المنتجات المستوردة فقط.',
            ),
          );
        }
      }
    });

    const repeatedSerial = firstDuplicate(serials);
    if (repeatedSerial) {
      throw new BadRequestException(
        translate(
          `Serial number ${repeatedSerial} is repeated in this contract review.`,
          `الرقم التسلسلي ${repeatedSerial} مكرر في مراجعة العقد هذه.`,
        ),
      );
    }
    const repeatedSupplierSerial = firstDuplicate(supplierSerials);
    if (repeatedSupplierSerial) {
      throw new BadRequestException(
        translate(
          `Supplier serial number ${repeatedSupplierSerial} is repeated in this contract review.`,
          `الرقم التسلسلي للمورد ${repeatedSupplierSerial} مكرر في مراجعة العقد هذه.`,
        ),
      );
    }

    return { dimensionById, productByCode, serials, supplierSerials };
  }

  private async assertSerialsAvailable(serials: string[], supplierSerials: string[]) {
    if (serials.length > 0) {
      const takenSerials = await this.db.query.productUnits.findMany({
        where: inArray(productUnits.serialNumber, serials),
        columns: { serialNumber: true },
      });
      if (takenSerials.length > 0) {
        const serial = takenSerials[0].serialNumber;
        throw new ConflictException(
          translate(`Serial number ${serial} is already registered.`, `الرقم التسلسلي ${serial} مسجل بالفعل.`),
        );
      }
    }

    if (supplierSerials.length > 0) {
      const takenSupplierSerials = await this.db.query.productUnits.findMany({
        where: inArray(productUnits.supplierSerialNumber, supplierSerials),
        columns: { supplierSerialNumber: true },
      });
      const taken = takenSupplierSerials.find((row) => row.supplierSerialNumber);
      if (taken?.supplierSerialNumber) {
        throw new ConflictException(
          translate(
            `Supplier serial number ${taken.supplierSerialNumber} is already registered.`,
            `الرقم التسلسلي للمورد ${taken.supplierSerialNumber} مسجل بالفعل.`,
          ),
        );
      }
    }
  }

  private statusCondition(status: string | undefined): SQL | undefined {
    if (!status) return undefined;
    if (status === 'open') return and(isNull(contracts.completedAt), isNull(contracts.cancelledAt));
    if (status === 'completed') return isNotNull(contracts.completedAt);
    if (status === 'cancelled') return isNotNull(contracts.cancelledAt);
    throw new BadRequestException(translate('Unknown contract review status.', 'حالة مراجعة العقد غير معروفة.'));
  }
}

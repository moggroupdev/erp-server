import { and, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  contractItems,
  contracts,
  customerReceptionItems,
  customers,
  deliveryItems,
  installationItems,
  maintenanceOrderItems,
  materialPurchaseRequisitionItemContractItems,
  productDimensions,
  productionPlanItems,
  productPurchaseOrderItems,
  productPurchaseReceiptItems,
  productUnits,
  products,
} from 'src/database/schema';
import { PRODUCT_SOURCE_TYPES } from 'src/utils/constants';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { type QueryParams, type User } from 'src/utils/types';
import { CreateLegacyContractDto } from './dto/create-legacy-contract.dto';
import { CreateLegacyContractItemDto } from './dto/create-legacy-contract-item.dto';
import { UpdateLegacyContractDto } from './dto/update-legacy-contract.dto';
import { UpdateLegacyContractItemDto } from './dto/update-legacy-contract-item.dto';
import { ValidateLegacyContractDto } from './dto/validate-legacy-contract.dto';
import { ValidateLegacyContractItemsDto } from './dto/validate-legacy-contract-items.dto';
import {
  ValidateLegacyContractUnitsDto,
  ValidateUpdateLegacyContractUnitsDto,
} from './dto/validate-legacy-contract-units.dto';

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

function sameInstant(left: Date | null, right: Date | null) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.getTime() === right.getTime();
}

function tempUniqueValue(prefix: string, id: string) {
  return `${prefix}${id.replace(/-/g, '')}`;
}

function legacyTotalAmount(items: { quantity: number; unitPrice: number | null }[]) {
  return items.reduce<number | null>((sum, item) => {
    if (sum == null || item.unitPrice == null) return null;
    return sum + item.quantity * item.unitPrice;
  }, 0);
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
      totalAmount: toNullableNumber(contract.totalAmount),
      discountPct: toNullableNumber(contract.discountPct),
      items: contract.items.map((item) => ({
        ...item,
        unitPrice: toNullableNumber(item.unitPrice),
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
    if (dto.contractId) await this.assertOpenLegacyContract(dto.contractId);
    await this.assertLegacyContractHeader(dto, dto.contractId);
    return { ok: true as const };
  }

  public async validateLegacyItems(dto: ValidateLegacyContractItemsDto) {
    await this.loadLegacyItemProducts(dto.items.map((item) => item.productDimensionId));
    return { ok: true as const };
  }

  public async validateLegacyUnits(dto: ValidateLegacyContractUnitsDto | ValidateUpdateLegacyContractUnitsDto) {
    if (dto.contractId) await this.assertOpenLegacyContract(dto.contractId);
    const { serials, supplierSerials } = await this.assertLegacyContractItems(dto.items);
    await this.assertSerialsAvailable(serials, supplierSerials, dto.contractId);
    return { ok: true as const };
  }

  public async createLegacy(dto: CreateLegacyContractDto, user: User) {
    await this.assertLegacyContractHeader(dto);
    const { dimensionById, productByCode, serials, supplierSerials } = await this.assertLegacyContractItems(dto.items);
    await this.assertSerialsAvailable(serials, supplierSerials);

    const totalAmount = legacyTotalAmount(dto.items);

    return await this.db.transaction(async (tx) => {
      const [contract] = await tx
        .insert(contracts)
        .values({
          code: sql`DEFAULT`,
          customerId: dto.customerId,
          legacyNumber: dto.legacyNumber,
          legacyWorkOrderNumber: dto.legacyWorkOrderNumber,
          deliveryAddressId: null,
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
            unitPrice: item.unitPrice ?? null,
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

  public async updateLegacy(id: string, dto: UpdateLegacyContractDto, user: User) {
    const existing = await this.loadOpenLegacyForUpdate(id);
    await this.assertLegacyContractHeader(dto, id);
    const { dimensionById, productByCode, serials, supplierSerials } = await this.assertLegacyContractItems(dto.items);
    await this.assertSerialsAvailable(serials, supplierSerials, id);

    const existingItems = existing.items.filter((item) => item.cancelledAt == null);
    const existingItemById = new Map(existingItems.map((item) => [item.id, item]));
    const payloadItemIds = dto.items.map((item) => item.id).filter((itemId): itemId is string => !!itemId);
    this.assertUniqueIds(payloadItemIds, 'item');

    for (const item of dto.items) {
      if (!item.id) continue;
      const existingItem = existingItemById.get(item.id);
      if (!existingItem) {
        throw new BadRequestException(
          translate(
            `Contract review line ${item.id} does not belong to this contract review.`,
            `بند مراجعة العقد ${item.id} لا ينتمي إلى مراجعة العقد هذه.`,
          ),
        );
      }

      const existingUnits = existingItem.productUnits.filter((unit) => unit.cancelledAt == null);
      const existingUnitById = new Map(existingUnits.map((unit) => [unit.id, unit]));
      const payloadUnitIds = item.units.map((unit) => unit.id).filter((unitId): unitId is string => !!unitId);
      this.assertUniqueIds(payloadUnitIds, 'unit');

      for (const unit of item.units) {
        if (!unit.id) continue;
        if (!existingUnitById.has(unit.id)) {
          throw new BadRequestException(
            translate(
              `Product unit ${unit.id} must stay on its current contract review line.`,
              `يجب أن تبقى وحدة المنتج ${unit.id} على بند مراجعة العقد الحالي.`,
            ),
          );
        }
      }
    }

    const keptItemIds = new Set(payloadItemIds);
    const removedItems = existingItems.filter((item) => !keptItemIds.has(item.id));
    const existingActiveUnits = existingItems.flatMap((item) =>
      item.productUnits
        .filter((unit) => unit.cancelledAt == null)
        .map((unit) => ({ ...unit, itemId: item.id, productCode: item.productCode })),
    );
    const keptUnitIds = new Set(
      dto.items.flatMap((item) => item.units.map((unit) => unit.id).filter((unitId): unitId is string => !!unitId)),
    );
    const removedUnits = existingActiveUnits.filter((unit) => !keptUnitIds.has(unit.id));
    const cancelledUnitsOnRemovedItems = removedItems.flatMap((item) => {
      const existingItem = existingItemById.get(item.id);
      return (existingItem?.productUnits ?? [])
        .filter((unit) => unit.cancelledAt != null)
        .map((unit) => ({ ...unit, itemId: item.id, productCode: item.productCode }));
    });
    const unitsToDelete = [...removedUnits, ...cancelledUnitsOnRemovedItems];

    await this.assertLegacyUpdateUnblocked({
      dto,
      existingItemById,
      removedItems,
      removedUnits: unitsToDelete,
    });

    const totalAmount = legacyTotalAmount(dto.items);

    return await this.db.transaction(async (tx) => {
      const keptUnitsToUpdate: {
        id: string;
        serialNumber: string;
        supplierSerialNumber: string | null;
        producedAt: Date | null;
        serialChanged: boolean;
        supplierSerialChanged: boolean;
      }[] = [];

      for (const item of dto.items) {
        if (!item.id) continue;
        const existingItem = existingItemById.get(item.id)!;
        const existingUnits = existingItem.productUnits.filter((unit) => unit.cancelledAt == null);
        const existingUnitById = new Map(existingUnits.map((unit) => [unit.id, unit]));
        const dimension = dimensionById.get(item.productDimensionId)!;
        const product = productByCode.get(dimension.productCode);
        const imported = product?.sourceType === PRODUCT_SOURCE_TYPES.IMPORTED;

        for (const unit of item.units) {
          if (!unit.id) continue;
          const existingUnit = existingUnitById.get(unit.id)!;
          const nextSupplier = imported ? unit.supplierSerialNumber : null;
          const nextProducedAt = unit.producedAt ? new Date(unit.producedAt) : null;
          const serialChanged = existingUnit.serialNumber !== unit.serialNumber;
          const supplierSerialChanged = (existingUnit.supplierSerialNumber ?? null) !== (nextSupplier ?? null);
          const producedChanged = !sameInstant(existingUnit.producedAt, nextProducedAt);
          if (!serialChanged && !supplierSerialChanged && !producedChanged) continue;
          keptUnitsToUpdate.push({
            id: unit.id,
            serialNumber: unit.serialNumber,
            supplierSerialNumber: nextSupplier ?? null,
            producedAt: nextProducedAt,
            serialChanged,
            supplierSerialChanged,
          });
        }
      }

      for (const unit of keptUnitsToUpdate) {
        if (!unit.serialChanged && !unit.supplierSerialChanged) continue;
        await tx
          .update(productUnits)
          .set({
            ...(unit.serialChanged ? { serialNumber: tempUniqueValue('tmp', unit.id) } : {}),
            ...(unit.supplierSerialChanged ? { supplierSerialNumber: tempUniqueValue('tmps', unit.id) } : {}),
          })
          .where(eq(productUnits.id, unit.id));
      }

      if (unitsToDelete.length > 0) {
        await tx.delete(productUnits).where(
          inArray(
            productUnits.id,
            unitsToDelete.map((unit) => unit.id),
          ),
        );
      }

      for (const unit of keptUnitsToUpdate) {
        await tx
          .update(productUnits)
          .set({
            serialNumber: unit.serialNumber,
            supplierSerialNumber: unit.supplierSerialNumber,
            producedAt: unit.producedAt,
          })
          .where(eq(productUnits.id, unit.id));
      }

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

        if (item.id) {
          const existingItem = existingItemById.get(item.id)!;
          const nextTitle = item.title ?? null;
          const nextNotes = item.notes ?? null;
          const nextPrice = item.unitPrice ?? null;
          const changed =
            existingItem.productDimensionId !== item.productDimensionId ||
            existingItem.productCode !== dimension.productCode ||
            (existingItem.title ?? null) !== nextTitle ||
            (existingItem.notes ?? null) !== nextNotes ||
            toNullableNumber(existingItem.unitPrice) !== nextPrice ||
            existingItem.quantity !== item.quantity;
          if (changed) {
            await tx
              .update(contractItems)
              .set({
                productDimensionId: item.productDimensionId,
                productCode: dimension.productCode,
                title: nextTitle,
                notes: nextNotes,
                unitPrice: nextPrice,
                quantity: item.quantity,
              })
              .where(eq(contractItems.id, item.id));
          }

          const newUnits = item.units.filter((unit) => !unit.id);
          if (newUnits.length > 0) {
            await tx.insert(productUnits).values(
              newUnits.map((unit) => ({
                serialNumber: unit.serialNumber,
                supplierSerialNumber: imported ? unit.supplierSerialNumber : null,
                contractItemId: item.id!,
                producedAt: unit.producedAt ? new Date(unit.producedAt) : null,
                createdBy: user.id,
              })),
            );
          }
          continue;
        }

        const [insertedItem] = await tx
          .insert(contractItems)
          .values({
            contractId: existing.id,
            productDimensionId: item.productDimensionId,
            productCode: dimension.productCode,
            title: item.title ?? null,
            notes: item.notes ?? null,
            unitPrice: item.unitPrice ?? null,
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

      if (removedItems.length > 0) {
        await tx.delete(contractItems).where(
          inArray(
            contractItems.id,
            removedItems.map((item) => item.id),
          ),
        );
      }

      const [contract] = await tx
        .update(contracts)
        .set({
          customerId: dto.customerId,
          legacyNumber: dto.legacyNumber,
          legacyWorkOrderNumber: dto.legacyWorkOrderNumber,
          deliveryTime: new Date(dto.deliveryTime),
          startedAt: new Date(dto.startedAt),
          createdAt: new Date(dto.createdAt),
          totalAmount,
        })
        .where(eq(contracts.id, id))
        .returning();

      return contract;
    });
  }

  private async assertLegacyContractHeader(dto: ValidateLegacyContractDto, excludeContractId?: string) {
    const customer = await this.db.query.customers.findFirst({
      where: eq(customers.id, dto.customerId),
      columns: { id: true },
    });
    if (!customer) {
      throw new NotFoundException(
        translate(`Customer with ID ${dto.customerId} does not exist.`, `لا يوجد عميل بالمعرف ${dto.customerId}.`),
      );
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

    const numberClashWhere = or(
      eq(contracts.legacyNumber, dto.legacyNumber),
      eq(contracts.legacyWorkOrderNumber, dto.legacyWorkOrderNumber),
    );
    const numberClashes = await this.db.query.contracts.findMany({
      where: excludeContractId ? and(numberClashWhere, ne(contracts.id, excludeContractId)) : numberClashWhere,
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

  private async assertLegacyContractItems(items: CreateLegacyContractItemDto[] | UpdateLegacyContractItemDto[]) {
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

  private async assertSerialsAvailable(serials: string[], supplierSerials: string[], excludeContractId?: string) {
    const excludeUnitIds = excludeContractId ? await this.activeUnitIdsOfContract(excludeContractId) : [];
    const excludeOwn = excludeUnitIds.length > 0 ? notInArray(productUnits.id, excludeUnitIds) : undefined;

    if (serials.length > 0) {
      const takenSerials = await this.db.query.productUnits.findMany({
        where: excludeOwn
          ? and(inArray(productUnits.serialNumber, serials), excludeOwn)
          : inArray(productUnits.serialNumber, serials),
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
        where: excludeOwn
          ? and(inArray(productUnits.supplierSerialNumber, supplierSerials), excludeOwn)
          : inArray(productUnits.supplierSerialNumber, supplierSerials),
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

  private async assertOpenLegacyContract(id: string) {
    const contract = await this.db.query.contracts.findFirst({
      where: eq(contracts.id, id),
      columns: { id: true, legacyNumber: true, inquiryId: true, cancelledAt: true, completedAt: true },
    });
    if (!contract) {
      throw new NotFoundException(
        translate(`Contract review with ID ${id} does not exist.`, `لا توجد مراجعة عقد بالمعرف ${id}.`),
      );
    }
    this.assertContractIsOpenLegacy(contract);
    return contract;
  }

  private assertContractIsOpenLegacy(contract: {
    legacyNumber: string | null;
    inquiryId: string | null;
    cancelledAt: Date | null;
    completedAt: Date | null;
  }) {
    if (!contract.legacyNumber || contract.inquiryId || contract.cancelledAt || contract.completedAt) {
      throw new BadRequestException(
        translate(
          'Only open legacy contract reviews can be updated this way.',
          'يمكن تعديل مراجعات العقود المرحلية المفتوحة فقط بهذه الطريقة.',
        ),
      );
    }
  }

  private async loadOpenLegacyForUpdate(id: string) {
    const contract = await this.db.query.contracts.findFirst({
      where: eq(contracts.id, id),
      with: {
        items: {
          with: {
            productUnits: {
              columns: {
                id: true,
                serialNumber: true,
                supplierSerialNumber: true,
                producedAt: true,
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
    this.assertContractIsOpenLegacy(contract);
    return contract;
  }

  private async activeUnitIdsOfContract(contractId: string) {
    const items = await this.db.query.contractItems.findMany({
      where: and(eq(contractItems.contractId, contractId), isNull(contractItems.cancelledAt)),
      columns: { id: true },
    });
    if (items.length === 0) return [];
    const units = await this.db.query.productUnits.findMany({
      where: and(
        inArray(
          productUnits.contractItemId,
          items.map((item) => item.id),
        ),
        isNull(productUnits.cancelledAt),
      ),
      columns: { id: true },
    });
    return units.map((unit) => unit.id);
  }

  private assertUniqueIds(ids: string[], kind: 'item' | 'unit') {
    const repeated = firstDuplicate(ids);
    if (!repeated) return;
    if (kind === 'item') {
      throw new BadRequestException(
        translate(
          `Contract review line ${repeated} is repeated in the payload.`,
          `بند مراجعة العقد ${repeated} مكرر في البيانات المرسلة.`,
        ),
      );
    }
    throw new BadRequestException(
      translate(
        `Product unit ${repeated} is repeated in the payload.`,
        `وحدة المنتج ${repeated} مكررة في البيانات المرسلة.`,
      ),
    );
  }

  private async assertLegacyUpdateUnblocked({
    dto,
    existingItemById,
    removedItems,
    removedUnits,
  }: {
    dto: UpdateLegacyContractDto;
    existingItemById: Map<
      string,
      {
        id: string;
        productCode: string;
        productDimensionId: string;
        productUnits: { id: string; serialNumber: string; cancelledAt: Date | null }[];
      }
    >;
    removedItems: { id: string; productCode: string }[];
    removedUnits: { id: string; serialNumber: string; itemId: string }[];
  }) {
    const removedUnitIds = removedUnits.map((unit) => unit.id);
    const dimensionChangeItemIds = dto.items
      .filter((item) => item.id && existingItemById.get(item.id)?.productDimensionId !== item.productDimensionId)
      .map((item) => item.id!);
    const dimensionChangeUnitIds = dimensionChangeItemIds.flatMap((itemId) =>
      (existingItemById.get(itemId)?.productUnits ?? [])
        .filter((unit) => unit.cancelledAt == null)
        .map((unit) => unit.id),
    );

    const referencedUnitIds = await this.referencedProductUnitIds([...removedUnitIds, ...dimensionChangeUnitIds]);
    const referencedItemIds = await this.referencedContractItemIds([
      ...removedItems.map((item) => item.id),
      ...dimensionChangeItemIds,
    ]);

    for (const unit of removedUnits) {
      if (referencedUnitIds.has(unit.id)) {
        throw new ConflictException(
          translate(
            `Serial number ${unit.serialNumber} cannot be removed because it is used in a later workflow.`,
            `لا يمكن حذف الرقم التسلسلي ${unit.serialNumber} لأنه مستخدم في إجراء لاحق.`,
          ),
        );
      }
    }

    for (const item of removedItems) {
      if (referencedItemIds.has(item.id)) {
        throw new ConflictException(
          translate(
            `Line ${item.productCode} cannot be removed because it is used in a later workflow.`,
            `لا يمكن حذف البند ${item.productCode} لأنه مستخدم في إجراء لاحق.`,
          ),
        );
      }
    }

    for (const item of dto.items) {
      if (!item.id) continue;
      if (!dimensionChangeItemIds.includes(item.id)) continue;
      const existingItem = existingItemById.get(item.id);
      if (!existingItem) continue;
      const lineUnits = existingItem.productUnits.filter((unit) => unit.cancelledAt == null);
      const unitBlocked = lineUnits.some((unit) => referencedUnitIds.has(unit.id));
      if (unitBlocked || referencedItemIds.has(item.id)) {
        throw new ConflictException(
          translate(
            `Line ${existingItem.productCode} cannot change dimension because it is used in a later workflow.`,
            `لا يمكن تغيير مقاس البند ${existingItem.productCode} لأنه مستخدم في إجراء لاحق.`,
          ),
        );
      }
    }
  }

  private async referencedProductUnitIds(unitIds: string[]) {
    const found = new Set<string>();
    if (unitIds.length === 0) return found;

    const [plans, deliveries, installations, receptions, receipts, maintenance] = await Promise.all([
      this.db
        .select({ id: productionPlanItems.productUnitId })
        .from(productionPlanItems)
        .where(inArray(productionPlanItems.productUnitId, unitIds)),
      this.db
        .select({ id: deliveryItems.productUnitId })
        .from(deliveryItems)
        .where(inArray(deliveryItems.productUnitId, unitIds)),
      this.db
        .select({ id: installationItems.productUnitId })
        .from(installationItems)
        .where(inArray(installationItems.productUnitId, unitIds)),
      this.db
        .select({ id: customerReceptionItems.productUnitId })
        .from(customerReceptionItems)
        .where(inArray(customerReceptionItems.productUnitId, unitIds)),
      this.db
        .select({ id: productPurchaseReceiptItems.productUnitId })
        .from(productPurchaseReceiptItems)
        .where(inArray(productPurchaseReceiptItems.productUnitId, unitIds)),
      this.db
        .select({ id: maintenanceOrderItems.productUnitId })
        .from(maintenanceOrderItems)
        .where(inArray(maintenanceOrderItems.productUnitId, unitIds)),
    ]);

    for (const row of [...plans, ...deliveries, ...installations, ...receptions, ...receipts, ...maintenance]) {
      found.add(row.id);
    }
    return found;
  }

  private async referencedContractItemIds(itemIds: string[]) {
    const found = new Set<string>();
    if (itemIds.length === 0) return found;

    const [requisitions, purchaseOrders] = await Promise.all([
      this.db
        .select({ id: materialPurchaseRequisitionItemContractItems.contractItemId })
        .from(materialPurchaseRequisitionItemContractItems)
        .where(inArray(materialPurchaseRequisitionItemContractItems.contractItemId, itemIds)),
      this.db
        .select({ id: productPurchaseOrderItems.contractItemId })
        .from(productPurchaseOrderItems)
        .where(inArray(productPurchaseOrderItems.contractItemId, itemIds)),
    ]);

    for (const row of [...requisitions, ...purchaseOrders]) found.add(row.id);
    return found;
  }

  private statusCondition(status: string | undefined): SQL | undefined {
    if (!status) return undefined;
    if (status === 'open') return and(isNull(contracts.completedAt), isNull(contracts.cancelledAt));
    if (status === 'completed') return isNotNull(contracts.completedAt);
    if (status === 'cancelled') return isNotNull(contracts.cancelledAt);
    throw new BadRequestException(translate('Unknown contract review status.', 'حالة مراجعة العقد غير معروفة.'));
  }
}

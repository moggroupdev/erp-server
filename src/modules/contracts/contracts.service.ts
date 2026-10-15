import { and, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { contracts } from 'src/database/schema';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { type QueryParams } from 'src/utils/types';

const USER_COLUMNS = { id: true, name: true } as const;
const CUSTOMER_COLUMNS = { id: true, code: true, name: true } as const;

function toNumber(value: string | number): number {
  return Number(value);
}

function toNullableNumber(value: string | number | null): number | null {
  return value == null ? null : Number(value);
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
      throw new NotFoundException(translate(`Contract with ID ${id} does not exist.`, `لا يوجد عقد بالمعرف ${id}.`));
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

  private statusCondition(status: string | undefined): SQL | undefined {
    if (!status) return undefined;
    if (status === 'open') return and(isNull(contracts.completedAt), isNull(contracts.cancelledAt));
    if (status === 'completed') return isNotNull(contracts.completedAt);
    if (status === 'cancelled') return isNotNull(contracts.cancelledAt);
    throw new BadRequestException(translate('Unknown contract status.', 'حالة العقد غير معروفة.'));
  }
}

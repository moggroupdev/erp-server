import { eq } from 'drizzle-orm';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { supplierInvoices } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

const ORDER_COLUMNS = { id: true, code: true } as const;
const SUPPLIER_COLUMNS = { id: true, name: true } as const;

@Injectable()
export class SupplierInvoicesService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
  ) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(supplierInvoices, queryParams, {
      filtering: true,
      searchableFields: ['invoiceNumber'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
      withRelations: {
        supplier: { columns: SUPPLIER_COLUMNS },
        materialPurchaseOrder: { columns: ORDER_COLUMNS },
        productPurchaseOrder: { columns: ORDER_COLUMNS },
        outsourcingOrder: { columns: ORDER_COLUMNS },
      },
    });
  }

  public async get(id: string) {
    const invoice = await this.db.query.supplierInvoices.findFirst({
      where: eq(supplierInvoices.id, id),
      with: {
        supplier: { columns: SUPPLIER_COLUMNS },
        materialPurchaseOrder: { columns: ORDER_COLUMNS },
        productPurchaseOrder: { columns: ORDER_COLUMNS },
        outsourcingOrder: { columns: ORDER_COLUMNS },
        createdBy: { columns: { id: true, name: true } },
      },
    });

    if (!invoice)
      throw new NotFoundException(
        translate(`Supplier invoice with ID ${id} does not exist.`, `لا توجد فاتورة مورد بالمعرف ${id}.`),
      );

    return invoice;
  }
}

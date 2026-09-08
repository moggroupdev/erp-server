import { Injectable } from '@nestjs/common';
import { supplierInvoices } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';

@Injectable()
export class SupplierInvoicesService {
  constructor(private queryBuilderService: QueryBuilderService) {}

  public async list(queryParams: QueryParams) {
    return await this.queryBuilderService.execute(supplierInvoices, queryParams, {
      filtering: true,
      searchableFields: ['invoiceNumber'],
      fieldLimiting: true,
      sorting: true,
      pagination: true,
    });
  }
}

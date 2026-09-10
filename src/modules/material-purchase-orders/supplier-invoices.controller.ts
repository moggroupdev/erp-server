import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { ApiListQueries } from 'src/utils/decorators';
import { type QueryParams, type User } from 'src/utils/types';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { PdfUploadInterceptor } from 'src/utils/interceptors/pdf-upload.interceptor';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { SupplierInvoicesService } from './supplier-invoices.service';

@Controller('supplier-invoices')
export class SupplierInvoicesController {
  constructor(private readonly supplierInvoicesService: SupplierInvoicesService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_SUPPLIER_INVOICE)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pdf: { type: 'string', format: 'binary' },
        materialPurchaseOrderId: { type: 'string', format: 'uuid' },
        invoiceNumber: { type: 'string' },
        issuedAt: { type: 'string', format: 'date' },
        totalPurchases: { type: 'number' },
        totalDiscount: { type: 'number' },
        vatAmount: { type: 'number' },
        withholdingTaxAmount: { type: 'number' },
        totalAmount: { type: 'number' },
      },
      required: ['pdf', 'materialPurchaseOrderId', 'invoiceNumber'],
    },
  })
  @UseInterceptors(PdfUploadInterceptor('pdf'))
  create(
    @Body() dto: CreateSupplierInvoiceDto,
    @UploadedFile() file: Express.Multer.File,
    @RequestUser() user: User,
  ) {
    return this.supplierInvoicesService.create(dto, file, user);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_SUPPLIER_INVOICES)
  @ApiBearerAuth()
  @ApiListQueries()
  list(@Query() query: QueryParams) {
    return this.supplierInvoicesService.list(query);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_SUPPLIER_INVOICES)
  @ApiBearerAuth()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierInvoicesService.get(id);
  }

  @Get(':id/pdf')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.READ_SUPPLIER_INVOICES)
  @ApiBearerAuth()
  @Header('Cache-Control', 'no-store')
  getPdf(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierInvoicesService.getPdf(id);
  }

  @Patch(':id/pdf')
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.UPDATE_SUPPLIER_INVOICE)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pdf: { type: 'string', format: 'binary' },
      },
      required: ['pdf'],
    },
  })
  @UseInterceptors(PdfUploadInterceptor('pdf'))
  uploadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.supplierInvoicesService.uploadPdf(id, file);
  }
}

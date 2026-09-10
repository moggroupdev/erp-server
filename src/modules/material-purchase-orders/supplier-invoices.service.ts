import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { materialPurchaseOrders, supplierInvoices } from 'src/database/schema';
import { QueryParams, type User } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { UploaderService } from 'src/utils/services/uploader.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { UpdateSupplierInvoiceFromPdfDto } from './dto/update-supplier-invoice-from-pdf.dto';

const ORDER_COLUMNS = { id: true, code: true } as const;
const SUPPLIER_COLUMNS = { id: true, name: true } as const;
const INVOICE_PDF_SUBDIRECTORY = 'supplier-invoices';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  path?: string;
};

@Injectable()
export class SupplierInvoicesService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private queryBuilderService: QueryBuilderService,
    private uploaderService: UploaderService,
  ) {}

  public async create(dto: CreateSupplierInvoiceDto, file: MulterFile | undefined, user: User) {
    if (!file) throw new BadRequestException(translate('A PDF file is required.', 'ملف PDF مطلوب.'));

    const order = await this.db.query.materialPurchaseOrders.findFirst({
      where: eq(materialPurchaseOrders.id, dto.materialPurchaseOrderId),
      columns: { id: true, code: true, supplierId: true, cancelledAt: true },
      with: { supplier: { columns: SUPPLIER_COLUMNS } },
    });

    if (!order)
      throw new NotFoundException(
        translate(
          `Material purchase order with ID ${dto.materialPurchaseOrderId} does not exist.`,
          `لا يوجد أمر توريد خامات بالمعرف ${dto.materialPurchaseOrderId}.`,
        ),
      );

    if (order.cancelledAt)
      throw new BadRequestException(
        translate(
          'Cannot add an invoice to a cancelled purchase order.',
          'لا يمكن إضافة فاتورة إلى أمر توريد ملغي.',
        ),
      );

    const invoiceNumber = dto.invoiceNumber.trim();
    const existing = await this.db.query.supplierInvoices.findFirst({
      where: and(eq(supplierInvoices.supplierId, order.supplierId), eq(supplierInvoices.invoiceNumber, invoiceNumber)),
      columns: { id: true },
    });

    if (existing)
      throw new ConflictException(
        translate(
          `Invoice number \`${invoiceNumber}\` already exists for this supplier.`,
          `رقم الفاتورة \`${invoiceNumber}\` موجود بالفعل لهذا المورد.`,
        ),
      );

    const pdfFilename = this.uploaderService.saveFile(
      file,
      INVOICE_PDF_SUBDIRECTORY,
      buildInvoicePdfFilename(invoiceNumber),
    );
    if (!pdfFilename) throw new BadRequestException(translate('Failed to save the PDF file.', 'فشل حفظ ملف PDF.'));

    try {
      const [inserted] = await this.db
        .insert(supplierInvoices)
        .values({
          invoiceNumber,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
          totalPurchases: dto.totalPurchases ?? null,
          totalDiscount: dto.totalDiscount ?? null,
          vatAmount: dto.vatAmount ?? null,
          withholdingTaxAmount: dto.withholdingTaxAmount ?? null,
          totalAmount: dto.totalAmount ?? null,
          materialPurchaseOrderId: order.id,
          supplierId: order.supplierId, // @RFP_APP_CHECKED - copy from linked MPO
          pdfFilename,
          createdBy: user.id,
        })
        .returning();

      return {
        ...inserted,
        supplier: order.supplier,
        materialPurchaseOrder: { id: order.id, code: order.code },
        productPurchaseOrder: null,
        outsourcingOrder: null,
      };
    } catch (error) {
      this.uploaderService.deleteFile(pdfFilename, INVOICE_PDF_SUBDIRECTORY);
      throw error;
    }
  }

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

  public async uploadPdf(id: string, dto: UpdateSupplierInvoiceFromPdfDto, file: MulterFile | undefined) {
    if (!file) throw new BadRequestException(translate('A PDF file is required.', 'ملف PDF مطلوب.'));

    const invoice = await this.get(id);
    const invoiceNumber = dto.invoiceNumber.trim();

    if (invoiceNumber !== invoice.invoiceNumber) {
      const existing = await this.db.query.supplierInvoices.findFirst({
        where: and(
          eq(supplierInvoices.supplierId, invoice.supplierId),
          eq(supplierInvoices.invoiceNumber, invoiceNumber),
        ),
        columns: { id: true },
      });

      if (existing && existing.id !== id)
        throw new ConflictException(
          translate(
            `Invoice number \`${invoiceNumber}\` already exists for this supplier.`,
            `رقم الفاتورة \`${invoiceNumber}\` موجود بالفعل لهذا المورد.`,
          ),
        );
    }

    const previousFilename = invoice.pdfFilename;
    const pdfFilename = this.uploaderService.saveFile(
      file,
      INVOICE_PDF_SUBDIRECTORY,
      buildInvoicePdfFilename(invoiceNumber),
    );
    if (!pdfFilename) throw new BadRequestException(translate('Failed to save the PDF file.', 'فشل حفظ ملف PDF.'));

    try {
      const [updated] = await this.db
        .update(supplierInvoices)
        .set({
          invoiceNumber,
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
          totalPurchases: dto.totalPurchases ?? null,
          totalDiscount: dto.totalDiscount ?? null,
          vatAmount: dto.vatAmount ?? null,
          withholdingTaxAmount: dto.withholdingTaxAmount ?? null,
          totalAmount: dto.totalAmount ?? null,
          pdfFilename,
        })
        .where(eq(supplierInvoices.id, id))
        .returning();

      if (previousFilename && previousFilename !== pdfFilename)
        this.uploaderService.deleteFile(previousFilename, INVOICE_PDF_SUBDIRECTORY);

      return {
        ...invoice,
        ...updated,
      };
    } catch (error) {
      this.uploaderService.deleteFile(pdfFilename, INVOICE_PDF_SUBDIRECTORY);
      throw error;
    }
  }

  public async getPdf(id: string): Promise<StreamableFile> {
    const invoice = await this.get(id);

    if (!invoice.pdfFilename)
      throw new NotFoundException(
        translate('This supplier invoice has no PDF attached.', 'لا يوجد ملف PDF مرفق بهذه الفاتورة.'),
      );

    const filepath = this.uploaderService.getFilePath(invoice.pdfFilename, INVOICE_PDF_SUBDIRECTORY);
    if (!filepath || !existsSync(filepath))
      throw new NotFoundException(
        translate('The invoice PDF file was not found on disk.', 'لم يتم العثور على ملف PDF الخاص بالفاتورة.'),
      );

    const stream = createReadStream(filepath);
    const safeDownloadName = sanitizeFilenamePart(invoice.invoiceNumber);
    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `inline; filename="${safeDownloadName}.pdf"`,
    });
  }
}

function buildInvoicePdfFilename(invoiceNumber: string): string {
  return `${sanitizeFilenamePart(invoiceNumber)}_${randomUUID().slice(0, 8)}.pdf`;
}

function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return (sanitized || 'invoice').slice(0, 80);
}

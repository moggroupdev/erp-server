import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { BadRequestException, Inject, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import { supplierInvoices } from 'src/database/schema';
import { QueryParams } from 'src/utils/types';
import { translate } from 'src/utils/i18n/translate';
import { QueryBuilderService } from 'src/utils/services/query-builder.service';
import { UploaderService } from 'src/utils/services/uploader.service';

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

  public async uploadPdf(id: string, file: MulterFile | undefined) {
    if (!file) throw new BadRequestException(translate('A PDF file is required.', 'ملف PDF مطلوب.'));

    const invoice = await this.get(id);
    const previousFilename = invoice.pdfFilename;
    const pdfFilename = this.uploaderService.saveFile(
      file,
      INVOICE_PDF_SUBDIRECTORY,
      buildInvoicePdfFilename(invoice.invoiceNumber),
    );
    if (!pdfFilename) throw new BadRequestException(translate('Failed to save the PDF file.', 'فشل حفظ ملف PDF.'));

    await this.db.update(supplierInvoices).set({ pdfFilename }).where(eq(supplierInvoices.id, id));

    if (previousFilename && previousFilename !== pdfFilename)
      this.uploaderService.deleteFile(previousFilename, INVOICE_PDF_SUBDIRECTORY);

    return { ...invoice, pdfFilename };
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
      disposition: `attachment; filename="${safeDownloadName}.pdf"`,
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

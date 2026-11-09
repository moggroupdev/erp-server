import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from 'src/database/database.constants';
import {
  inventoryTransactionItems,
  inventoryTransactions,
  materialPurchaseOrderItems,
  materialPurchaseOrders,
  materialPurchaseReceiptItems,
  materialPurchaseReceipts,
  materials,
  supplierInvoices,
  suppliers,
} from 'src/database/schema';
import { INVENTORY_TRANSACTION_TYPES, LEGACY_RECEIPT_IMPORT_NOTE } from 'src/utils/constants';
import { materialUnitConversionsExtra } from 'src/utils/extras/material-unit-conversions-extra';
import { mergePurchaseOrderLines } from 'src/utils/helpers/merge-purchase-order-lines';
import {
  buildInvoicePdfFilename,
  SUPPLIER_INVOICE_PDF_SUBDIRECTORY,
} from 'src/utils/helpers/supplier-invoice-pdf-filename';
import { resolveConversionFactor } from 'src/utils/helpers/unit-conversion';
import { translate } from 'src/utils/i18n/translate';
import { MaterialUnitValidationService } from 'src/utils/services/material-unit-validation.service';
import { UploaderService } from 'src/utils/services/uploader.service';
import { type MaterialUnit, type User } from 'src/utils/types';
import { CreateLegacyReceiptPermitDto } from './dto/create-legacy-receipt-permit.dto';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  path?: string;
};

type UnitConversion = { unit: MaterialUnit; conversionFactorToBase: number };

@Injectable()
export class LegacyReceiptPermitsService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private materialUnitValidationService: MaterialUnitValidationService,
    private uploaderService: UploaderService,
  ) {}

  public async create(dto: CreateLegacyReceiptPermitDto, file: MulterFile | undefined, user: User) {
    if (!file) throw new BadRequestException(translate('A PDF file is required.', 'ملف PDF مطلوب.'));

    const invoiceNumber = dto.invoice.invoiceNumber.trim();
    const issuedAt = new Date(dto.invoice.issuedAt);
    if (Number.isNaN(issuedAt.getTime())) {
      throw new BadRequestException(translate('Invalid invoice issue date.', 'تاريخ إصدار الفاتورة غير صالح.'));
    }

    const supplier = await this.db.query.suppliers.findFirst({
      where: eq(suppliers.id, dto.supplierId),
      columns: { id: true, name: true },
    });
    if (!supplier) {
      throw new NotFoundException(
        translate(`Supplier with ID ${dto.supplierId} does not exist.`, `لا يوجد مورد بالمعرف ${dto.supplierId}.`),
      );
    }

    this.assertPayloadShape(dto, issuedAt);

    const legacyNumbers = dto.permits.map((permit) => permit.legacyNumber.trim());
    const existingLegacy = await this.db.query.inventoryTransactions.findMany({
      where: inArray(inventoryTransactions.legacyNumber, legacyNumbers),
      columns: { legacyNumber: true },
    });
    if (existingLegacy.length > 0) {
      const conflicts = [...new Set(existingLegacy.map((row) => row.legacyNumber).filter(Boolean))].join(', ');
      throw new ConflictException(
        translate(
          `Addition permit number(s) already exist: ${conflicts}.`,
          `رقم/أرقام إذن الإضافة موجودة بالفعل: ${conflicts}.`,
        ),
      );
    }

    const existingInvoice = await this.db.query.supplierInvoices.findFirst({
      where: and(eq(supplierInvoices.supplierId, supplier.id), eq(supplierInvoices.invoiceNumber, invoiceNumber)),
      columns: { id: true },
    });
    if (existingInvoice) {
      throw new ConflictException(
        translate(
          `Invoice number \`${invoiceNumber}\` already exists for this supplier.`,
          `رقم الفاتورة \`${invoiceNumber}\` موجود بالفعل لهذا المورد.`,
        ),
      );
    }

    const allItems = dto.permits.flatMap((permit) =>
      permit.items.map((item) => ({
        materialCode: item.materialCode,
        unitOfMeasurementSelected: item.unitOfMeasurementSelected,
      })),
    );
    await this.materialUnitValidationService.assertValidSelectedUnits(allItems);

    const materialCodes = [...new Set(allItems.map((item) => item.materialCode))];
    const materialRows = await this.db.query.materials.findMany({
      where: inArray(materials.code, materialCodes),
      columns: { code: true, unitOfMeasurement: true },
      extras: materialUnitConversionsExtra,
    });
    const materialByCode = new Map(materialRows.map((row) => [row.code, row]));

    const mergeInputs = dto.permits.flatMap((permit) =>
      permit.items.map((item) => {
        const material = materialByCode.get(item.materialCode)!;
        const conversions = (material.unitConversions ?? []) as UnitConversion[];
        const factor = resolveConversionFactor(
          item.unitOfMeasurementSelected,
          material.unitOfMeasurement,
          conversions,
        );
        return {
          materialCode: item.materialCode,
          unitOfMeasurementSelected: item.unitOfMeasurementSelected,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          baseUnit: material.unitOfMeasurement,
          conversionFactorToBase: factor,
        };
      }),
    );

    const { items: mergedOrderItems, totalAmount } = mergePurchaseOrderLines(mergeInputs);

    const pdfFilename = this.uploaderService.saveFile(
      file,
      SUPPLIER_INVOICE_PDF_SUBDIRECTORY,
      buildInvoicePdfFilename(invoiceNumber),
    );
    if (!pdfFilename) throw new BadRequestException(translate('Failed to save the PDF file.', 'فشل حفظ ملف PDF.'));

    try {
      return await this.db.transaction(async (tx) => {
        const [createdOrder] = await tx
          .insert(materialPurchaseOrders)
          .values({
            code: sql`DEFAULT`,
            supplierId: supplier.id,
            totalAmount,
            completedAt: issuedAt,
            notes: LEGACY_RECEIPT_IMPORT_NOTE,
            createdAt: issuedAt,
            createdBy: user.id,
          })
          .returning({
            id: materialPurchaseOrders.id,
            code: materialPurchaseOrders.code,
          });

        const createdOrderItems = await tx
          .insert(materialPurchaseOrderItems)
          .values(
            mergedOrderItems.map((item) => ({
              materialPurchaseOrderId: createdOrder.id,
              materialCode: item.materialCode,
              unitOfMeasurementSelected: item.unitOfMeasurementSelected,
              quantityOrdered: item.quantityOrdered,
              unitPrice: item.unitPrice,
            })),
          )
          .returning({
            id: materialPurchaseOrderItems.id,
            materialCode: materialPurchaseOrderItems.materialCode,
          });

        const orderItemIdByMaterialCode = new Map(
          createdOrderItems.map((item) => [item.materialCode, item.id]),
        );

        const permitResults: Array<{
          legacyNumber: string;
          receipt: { id: string; code: string };
          inventoryTransaction: { id: string; code: string };
        }> = [];

        for (const permit of dto.permits) {
          const legacyNumber = permit.legacyNumber.trim();
          const receivedAt = new Date(permit.receivedAt);

          const [createdReceipt] = await tx
            .insert(materialPurchaseReceipts)
            .values({
              code: sql`DEFAULT`,
              materialPurchaseOrderId: createdOrder.id,
              receivedAt,
              receivedBy: user.id,
              notes: LEGACY_RECEIPT_IMPORT_NOTE,
              createdAt: receivedAt,
              createdBy: user.id,
            })
            .returning({
              id: materialPurchaseReceipts.id,
              code: materialPurchaseReceipts.code,
            });

          await tx.insert(materialPurchaseReceiptItems).values(
            permit.items.map((item) => ({
              materialPurchaseReceiptId: createdReceipt.id,
              materialPurchaseOrderItemId: orderItemIdByMaterialCode.get(item.materialCode)!,
              unitOfMeasurementSelected: item.unitOfMeasurementSelected,
              quantityReceived: item.quantity,
              quantityRejected: 0,
            })),
          );

          const [createdTransaction] = await tx
            .insert(inventoryTransactions)
            .values({
              code: sql`DEFAULT`,
              legacyNumber,
              transactionType: INVENTORY_TRANSACTION_TYPES.RECEIPT,
              materialPurchaseReceiptId: createdReceipt.id,
              notes: LEGACY_RECEIPT_IMPORT_NOTE,
              createdAt: receivedAt,
              createdBy: user.id,
            })
            .returning({
              id: inventoryTransactions.id,
              code: inventoryTransactions.code,
            });

          await tx.insert(inventoryTransactionItems).values(
            permit.items.map((item) => ({
              transactionId: createdTransaction.id,
              materialCode: item.materialCode,
              unitOfMeasurementSelected: item.unitOfMeasurementSelected,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            })),
          );

          permitResults.push({
            legacyNumber,
            receipt: createdReceipt,
            inventoryTransaction: createdTransaction,
          });
        }

        const [createdInvoice] = await tx
          .insert(supplierInvoices)
          .values({
            invoiceNumber,
            issuedAt,
            totalPurchases: dto.invoice.totalPurchases ?? null,
            totalDiscount: dto.invoice.totalDiscount ?? null,
            vatAmount: dto.invoice.vatAmount ?? null,
            withholdingTaxAmount: dto.invoice.withholdingTaxAmount ?? null,
            totalAmount: dto.invoice.totalAmount ?? null,
            materialPurchaseOrderId: createdOrder.id,
            supplierId: supplier.id, // @RFP_APP_CHECKED - copy from linked MPO
            pdfFilename,
            createdAt: issuedAt,
            createdBy: user.id,
          })
          .returning({
            id: supplierInvoices.id,
            invoiceNumber: supplierInvoices.invoiceNumber,
          });

        return {
          materialPurchaseOrder: createdOrder,
          supplierInvoice: createdInvoice,
          permits: permitResults,
        };
      });
    } catch (error) {
      this.uploaderService.deleteFile(pdfFilename, SUPPLIER_INVOICE_PDF_SUBDIRECTORY);
      throw error;
    }
  }

  // ============================== PRIVATE METHODS ==============================

  private assertPayloadShape(dto: CreateLegacyReceiptPermitDto, issuedAt: Date) {
    const legacyNumbers = new Set<string>();

    for (const permit of dto.permits) {
      const legacyNumber = permit.legacyNumber.trim();
      if (legacyNumbers.has(legacyNumber)) {
        throw new BadRequestException(
          translate(
            `Addition permit number \`${legacyNumber}\` is repeated in the payload.`,
            `رقم إذن الإضافة \`${legacyNumber}\` مكرر في الطلب.`,
          ),
        );
      }
      legacyNumbers.add(legacyNumber);

      const receivedAt = new Date(permit.receivedAt);
      if (Number.isNaN(receivedAt.getTime())) {
        throw new BadRequestException(
          translate(
            `Invalid receipt date for permit \`${legacyNumber}\`.`,
            `تاريخ الاستلام غير صالح لإذن الإضافة \`${legacyNumber}\`.`,
          ),
        );
      }

      // Compare calendar days in UTC so time-of-day from ISO strings does not flip the check.
      const issuedDay = Date.UTC(issuedAt.getUTCFullYear(), issuedAt.getUTCMonth(), issuedAt.getUTCDate());
      const receivedDay = Date.UTC(receivedAt.getUTCFullYear(), receivedAt.getUTCMonth(), receivedAt.getUTCDate());
      if (receivedDay < issuedDay) {
        throw new BadRequestException(
          translate(
            `Permit \`${legacyNumber}\` date must be on or after the invoice issue date.`,
            `تاريخ إذن الإضافة \`${legacyNumber}\` يجب أن يكون في أو بعد تاريخ إصدار الفاتورة.`,
          ),
        );
      }

      const materialCodes = new Set<string>();
      for (const item of permit.items) {
        if (materialCodes.has(item.materialCode)) {
          throw new BadRequestException(
            translate(
              `Material ${item.materialCode} is repeated in permit \`${legacyNumber}\`.`,
              `المادة ${item.materialCode} مكررة في إذن الإضافة \`${legacyNumber}\`.`,
            ),
          );
        }
        materialCodes.add(item.materialCode);
      }
    }
  }
}

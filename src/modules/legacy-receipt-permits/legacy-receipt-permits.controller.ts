import { Body, Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { PermissionGuard } from 'src/modules/auth/guards/permission.guard';
import { AllowedPermission } from 'src/modules/auth/decorators/allowed-permission.decorator';
import { RequestUser } from 'src/modules/auth/decorators/request-user.decorator';
import { PERMISSIONS } from 'src/utils/constants';
import { PdfUploadInterceptor } from 'src/utils/interceptors/pdf-upload.interceptor';
import { type User } from 'src/utils/types';
import { CreateLegacyReceiptPermitFormDto } from './dto/create-legacy-receipt-permit.dto';
import { LegacyReceiptPermitsService } from './legacy-receipt-permits.service';

@Controller('legacy-receipt-permits')
export class LegacyReceiptPermitsController {
  constructor(private readonly legacyReceiptPermitsService: LegacyReceiptPermitsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @AllowedPermission(PERMISSIONS.ADD_LEGACY_RECEIPT_PERMIT)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        pdf: { type: 'string', format: 'binary' },
        payload: {
          type: 'string',
          description: 'JSON string of CreateLegacyReceiptPermitDto (supplierId, invoice, permits)',
        },
      },
      required: ['pdf', 'payload'],
    },
  })
  @UseInterceptors(PdfUploadInterceptor('pdf'))
  create(
    @Body() form: CreateLegacyReceiptPermitFormDto,
    @UploadedFile() file: Express.Multer.File,
    @RequestUser() user: User,
  ) {
    return this.legacyReceiptPermitsService.create(form.payload, file, user);
  }
}

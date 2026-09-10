import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { translate } from 'src/utils/i18n/translate';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_PDF_TYPES = ['application/pdf'];

const multerOptions: MulterOptions = {
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_PDF_TYPES.includes(file.mimetype))
      callback(
        new BadRequestException(
          translate('Only PDF files are allowed.', 'يُسمح بملفات PDF فقط.'),
        ),
        false,
      );
    else callback(null, true);
  },
};

/**
 * Custom interceptor that combines FileInterceptor with PDF validation
 *
 * Usage: `@UseInterceptors(PdfUploadInterceptor('fieldName'))`
 */
export function PdfUploadInterceptor(fieldName: string = 'pdf') {
  return FileInterceptor(fieldName, multerOptions);
}

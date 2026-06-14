import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTENSTIONS = ALLOWED_IMAGE_TYPES.map((type) => type.split('/')[1].toUpperCase());

const multerOptions: MulterOptions = {
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype))
      callback(new BadRequestException(`Only image files are allowed (${ALLOWED_EXTENSTIONS.join(', ')}).`), false);
    else callback(null, true);
  },
};

/**
 * Custom interceptor that combines FileInterceptor with image validation
 *
 * Usage: `@UseInterceptors(ImageUploadInterceptor('fieldName'))`
 */
export function ImageUploadInterceptor(fieldName: string = 'image') {
  return FileInterceptor(fieldName, multerOptions);
}

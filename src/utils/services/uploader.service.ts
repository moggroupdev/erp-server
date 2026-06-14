import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

type MulterFile = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class UploaderService {
  private readonly uploadsDir: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.uploadsDir = path.join(process.cwd(), 'uploads');
    this.baseUrl = this.configService.getOrThrow<string>('BASE_URL');

    // Ensure base upload directory exists
    if (!fs.existsSync(this.uploadsDir)) fs.mkdirSync(this.uploadsDir, { recursive: true });
  }

  public saveFile(file: MulterFile | undefined, subdirectory: string): string | null {
    if (!file) return null;

    // Ensure subdirectory exists
    this.ensureSubdirectoryExists(subdirectory);

    // Generate unique filename
    const fileExtension = path.extname(file.originalname);
    const filename = `${randomUUID()}${fileExtension}`;
    const filepath = path.join(this.getSubdirectoryPath(subdirectory), filename);

    // Write file to disk
    fs.writeFileSync(filepath, file.buffer);

    return filename;
  }

  public deleteFile(filename: string | null, subdirectory: string): void {
    if (!filename) return;
    const filepath = path.join(this.getSubdirectoryPath(subdirectory), filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }

  public getFileUrl(filename: string | null, subdirectory: string): string | null {
    if (!filename) return null;
    return `${this.baseUrl}/${subdirectory}/${filename}`;
  }

  // ========== Private Helpers ==========

  private getSubdirectoryPath(subdirectory: string): string {
    return path.join(this.uploadsDir, subdirectory);
  }

  private ensureSubdirectoryExists(subdirectory: string): void {
    const subdirectoryPath = this.getSubdirectoryPath(subdirectory);
    if (!fs.existsSync(subdirectoryPath)) fs.mkdirSync(subdirectoryPath, { recursive: true });
  }
}

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

  public saveFile(file: MulterFile | undefined, subdirectory: string, filename?: string): string | null {
    if (!file) return null;

    const fileData = resolveFileBuffer(file);
    if (!fileData) return null;

    // Ensure subdirectory exists
    this.ensureSubdirectoryExists(subdirectory);

    // Use provided filename, or generate a unique UUID-based one
    const fileExtension = path.extname(file.originalname) || '.bin';
    const resolvedFilename = filename ?? `${randomUUID()}${fileExtension}`;
    const filepath = path.join(this.getSubdirectoryPath(subdirectory), resolvedFilename);

    // Write file to disk (overwrites when the same filename is reused)
    fs.writeFileSync(filepath, fileData);

    return resolvedFilename;
  }

  public deleteFile(filename: string | null | undefined, subdirectory: string): void {
    if (!filename) return;
    // Prevent path traversal; only the basename is ever deleted
    const safeName = path.basename(filename.trim());
    if (!safeName || safeName === '.' || safeName === '..') return;

    const filepath = path.join(this.getSubdirectoryPath(subdirectory), safeName);
    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
      } catch {
        // Best-effort: file may be locked by a viewer/antivirus on Windows
      }
    }
  }

  public getFileUrl(filename: string | null, subdirectory: string): string | null {
    if (!filename) return null;
    return `${this.baseUrl}/${subdirectory}/${filename}`;
  }

  public getFilePath(filename: string | null, subdirectory: string): string | null {
    if (!filename) return null;
    return path.join(this.getSubdirectoryPath(subdirectory), filename);
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

function resolveFileBuffer(file: MulterFile & { path?: string }): Buffer | null {
  if (file.buffer && file.buffer.length > 0) return file.buffer;
  if (file.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
  return null;
}

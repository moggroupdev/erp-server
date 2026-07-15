import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import { isDevelopmentMode, isProductionMode } from 'src/utils/env';

@Injectable()
export class AppService {
  private readonly version = this.readPackageVersion();

  checkAppHealth(): string {
    const memory = process.memoryUsage();
    const environment = isDevelopmentMode()
      ? 'Development'
      : isProductionMode()
        ? 'Production'
        : (process.env.ENVIRONMENT ?? 'Unknown');
    const uptimeSeconds = process.uptime();
    const now = new Date();
    const heapPct = Math.min(100, Math.round((memory.heapUsed / memory.heapTotal) * 100));

    const docsBlock = isDevelopmentMode()
      ? `<a class="cta" href="/api/docs" target="_blank">
          <span>Open API Docs</span>
        </a>`
      : '';

    const values: Record<string, string> = {
      HEAP_PCT: String(heapPct),
      NODE_VERSION: process.version,
      PID: String(process.pid),
      ENVIRONMENT: environment,
      VERSION: this.version,
      UPTIME: this.formatUptime(uptimeSeconds),
      PLATFORM: `${process.platform} · ${process.arch}`,
      RSS: this.formatBytes(memory.rss),
      HEAP_USED: this.formatBytes(memory.heapUsed),
      HEAP_TOTAL: this.formatBytes(memory.heapTotal),
      CHECKED_AT: now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      CHECKED_AT_ISO: now.toISOString(),
      DOCS_BLOCK: docsBlock,
      YEAR: String(now.getFullYear()),
      UPTIME_MS: String(Math.floor(uptimeSeconds * 1000)),
    };

    return this.readHealthTemplate().replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '');
  }

  private readHealthTemplate(): string {
    const candidates = [
      join(__dirname, 'assets', 'health.html'),
      join(process.cwd(), 'src', 'assets', 'health.html'),
      join(process.cwd(), 'dist', 'src', 'assets', 'health.html'),
    ];

    for (const path of candidates) {
      if (existsSync(path)) return readFileSync(path, 'utf8');
    }

    throw new Error('Health HTML template not found (src/assets/health.html).');
  }

  private readPackageVersion(): string {
    try {
      const raw = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
      const pkg = JSON.parse(raw) as { version?: string };
      return pkg.version ?? '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  private formatUptime(seconds: number): string {
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
}

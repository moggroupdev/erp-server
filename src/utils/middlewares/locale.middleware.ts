import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { resolveLocale, runWithLocale } from 'src/utils/i18n/locale.context';

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const locale = resolveLocale(req.headers['accept-language']);
    runWithLocale(locale, () => next());
  }
}

import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { translate } from 'src/utils/i18n/translate';

interface PostgresError extends Error {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
  column?: string;
}

interface DrizzleError extends Error {
  cause?: PostgresError | Error;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = translate('An unexpected error occurred', 'حدث خطأ غير متوقع');
    let errorType = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      // Check if response is an object (standard NestJS error object)
      if (typeof res === 'object' && res !== null) {
        const errorResponse = res as Record<string, unknown>;
        // Safely extract message and error
        message = (errorResponse.message as string | string[]) || 'HTTP Exception';
        errorType = (errorResponse.error as string) || 'HTTP Exception';
      } else {
        // If response is just a string
        message = res;
        errorType = 'HTTP Exception';
      }
    } else if (this.isDrizzleError(exception)) {
      const dbError = exception.cause as PostgresError;
      if (dbError?.code === '23505') {
        status = HttpStatus.CONFLICT;
        message = this.formatDatabaseMessage(dbError);
        errorType = 'Conflict';
      } else if (dbError?.code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        message = this.formatDatabaseMessage(dbError);
        errorType = 'Bad Request';
      } else if (dbError?.code === '23502') {
        status = HttpStatus.BAD_REQUEST;
        message = this.formatDatabaseMessage(dbError);
        errorType = 'Bad Request';
      } else message = dbError?.message ?? exception.message;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const logMessage = Array.isArray(message) ? message.join(', ') : message;
    this.logger.error(`[${status}] ${logMessage}`);

    response.status(status).json({
      statusCode: status,
      message: Array.isArray(message) ? message[0] : message,
      error: errorType,
    });
  }

  // =================== Private Methods ===================

  // Type Guard to safely check for Drizzle errors
  private isDrizzleError(err: unknown): err is DrizzleError {
    return err instanceof Error && ('cause' in err || err.name === 'DrizzleError' || err.name === 'DrizzleQueryError');
  }

  private formatDatabaseMessage(dbError: PostgresError): string {
    const detail = dbError.detail || '';

    // 1. Handle Unique Violations (Code 23505)
    if (dbError.code === '23505') {
      const matches = detail.match(/\(([^)]+)\)=\(([^)]+)\)/);
      const field = matches ? matches[1] : 'information';
      const value = matches ? matches[2] : '';
      // Format: "email_address" -> "Email address"
      const label = field.replace('_', ' ');
      return value
        ? translate(
            `This ${label} \`${value}\` is already registered. Please try another one.`,
            `هذا ${label} \`${value}\` مسجل بالفعل. يرجى تجربة قيمة أخرى.`,
          )
        : translate(
            `This ${label} is already registered. Please try another one.`,
            `هذا ${label} مسجل بالفعل. يرجى تجربة قيمة أخرى.`,
          );
    }

    // 2. Handle Foreign Key Violations (Code 23503)
    if (dbError.code === '23503') {
      const matches = detail.match(/\(([^)]+)\)=\(([^)]+)\)/);
      const field = matches ? matches[1] : 'item';
      const value = matches ? matches[2] : '';
      // Remove '_id' and clean up formatting
      const cleanField = field.replace('_id', '').replace('_', ' ');
      return value
        ? translate(
            `We couldn't find the ${cleanField} of \`${value}\` you selected.`,
            `لم نتمكن من العثور على ${cleanField} \`${value}\` الذي اخترته.`,
          )
        : translate(`We couldn't find the ${cleanField} you selected.`, `لم نتمكن من العثور على ${cleanField} الذي اخترته.`);
    }

    // 3. Handle Not-Null Violations (Code 23502)
    if (dbError.code === '23502') {
      const column = dbError.column || dbError.message.match(/null value in column "([^"]+)"/)?.[1] || 'field';
      const label = column.replace(/_/g, ' ');
      return translate(`The ${label} is required.`, `حقل ${label} مطلوب.`);
    }

    return dbError.message || translate('A database integrity error occurred.', 'حدث خطأ في تكامل قاعدة البيانات.');
  }
}

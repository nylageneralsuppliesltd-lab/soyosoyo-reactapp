import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientRustPanicError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // Log full exception once
    this.logger.error('Unhandled exception', exception as any);

    // Prisma known request errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const code = exception.code;
      const meta = (exception.meta as Record<string, any>) || {};
      const message = exception.message || 'Prisma request error';

      const status =
        code === 'P2002' ? HttpStatus.CONFLICT :
        code === 'P2025' ? HttpStatus.NOT_FOUND :
        HttpStatus.BAD_REQUEST;

      return response.status(status).json({
        error: 'PrismaClientKnownRequestError',
        code,
        message,
        meta,
      });
    }

    // Prisma initialization / runtime errors
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: 'PrismaClientInitializationError',
        message: exception.message,
      });
    }

    if (exception instanceof Prisma.PrismaClientRustPanicError) {
      return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'PrismaClientRustPanicError',
        message: exception.message,
      });
    }

    // Fallback
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'InternalServerError',
      message: (exception as any)?.message || 'Unexpected error',
    });
  }
}

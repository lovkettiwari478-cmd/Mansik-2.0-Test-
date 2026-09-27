import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;
  
  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const requestId = (req as any).requestId || 'unknown';
  
  console.error(`[${requestId}] Error:`, err);
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      requestId
    });
  }
  
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation error',
      code: 'VALIDATION_ERROR',
      details: err.errors,
      requestId
    });
  }
  
  // Multer file filter errors - file type validation
  if (err.message && (err.message.includes('File type') || err.message.includes('not allowed') || err.message.includes('Invalid file'))) {
    return res.status(400).json({
      error: err.message,
      code: 'INVALID_FILE_TYPE',
      requestId
    });
  }
  
  // Multer errors
  if (err.code && err.code.startsWith('LIMIT_')) {
    return res.status(400).json({
      error: `File upload error: ${err.message}`,
      code: 'FILE_TOO_LARGE',
      requestId
    });
  }
  
  // Don't leak stack traces in production
  const isProd = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    error: isProd ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    requestId,
    ...(isProd ? {} : { stack: err.stack })
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
    requestId: (req as any).requestId
  });
}

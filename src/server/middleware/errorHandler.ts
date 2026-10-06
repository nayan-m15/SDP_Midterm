import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { AppError, asAppError } from '../errors';

export const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  void next;
  let appError: AppError;
  if (error instanceof multer.MulterError) {
    appError = new AppError(
      error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
      error.code === 'LIMIT_FILE_SIZE' ? 'UPLOAD_TOO_LARGE' : 'INVALID_UPLOAD',
      error.code === 'LIMIT_FILE_SIZE'
        ? 'The ZIP exceeds the configured upload limit.'
        : 'The repository upload is invalid.',
      error,
    );
  } else {
    appError = asAppError(error);
  }

  if (appError.status >= 500) {
    console.error(appError.cause ?? appError);
  }
  response.status(appError.status).json({
    error: { code: appError.code, message: appError.message },
  });
};

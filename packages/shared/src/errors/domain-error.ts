import { AppError, type AppErrorOptions } from './app-error.js';


export class DomainError extends AppError {
  constructor(
    opts: Omit<AppErrorOptions, 'httpStatus'> & { httpStatus?: number },
  ) {
    super({ httpStatus: 422, ...opts });
  }
}
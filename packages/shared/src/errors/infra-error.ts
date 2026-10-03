import { AppError, type AppErrorOptions } from './app-error.js';


export class InfraError extends AppError {
  constructor(
    opts: Omit<AppErrorOptions, 'httpStatus'> & { httpStatus?: number },
  ) {
    super({ httpStatus: 503, ...opts });
  }
}
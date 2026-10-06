import { AppError } from '@reservio/shared';

export class AvailabilityContextNotFoundError extends AppError {
  constructor() {
    super({
      code: 'AVAILABILITY_CONTEXT_NOT_FOUND',
      message: 'Business, location, resource, or service not found',
      httpStatus: 404,
    });
  }
}

export class InvalidDateError extends AppError {
  constructor(date: string) {
    super({
      code: 'INVALID_DATE',
      message: `Invalid date: "${date}". Expected YYYY-MM-DD`,
      httpStatus: 400,
    });
  }
}

export class RuleNotFoundError extends AppError {
  constructor(ruleId: string) {
    super({
      code: 'AVAILABILITY_RULE_NOT_FOUND',
      message: `Availability rule not found: ${ruleId}`,
      httpStatus: 404,
    });
  }
}

export class InvalidRuleError extends AppError {
  constructor(message: string) {
    super({
      code: 'INVALID_AVAILABILITY_RULE',
      message,
      httpStatus: 400,
    });
  }
}

export class ExceptionNotFoundError extends AppError {
  constructor(exceptionId: string) {
    super({
      code: 'AVAILABILITY_EXCEPTION_NOT_FOUND',
      message: `Availability exception not found: ${exceptionId}`,
      httpStatus: 404,
    });
  }
}

export class InvalidExceptionError extends AppError {
  constructor(message: string) {
    super({
      code: 'INVALID_AVAILABILITY_EXCEPTION',
      message,
      httpStatus: 400,
    });
  }
}

export class ResourceNotFoundError extends AppError {
  constructor(resourceId: string) {
    super({
      code: 'RESOURCE_NOT_FOUND',
      message: `Resource not found: ${resourceId}`,
      httpStatus: 404,
    });
  }
}
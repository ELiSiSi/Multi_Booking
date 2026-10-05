import { AppError } from '@reservio/shared';


export class EmptyNameError extends AppError {
  constructor() {
    super({
      code: 'EMPTY_NAME',
      message: 'Name must not be empty after trimming whitespace',
      httpStatus: 400,
    });
  }
}

export class InvalidTimezoneError extends AppError {
  constructor(timezone: string) {
    super({
      code: 'INVALID_TIMEZONE',
      message: `Invalid IANA timezone: "${timezone}"`,
      httpStatus: 400,
    });
  }
}

export class InvalidCursorError extends AppError {
  constructor() {
    super({
      code: 'INVALID_CURSOR',
      message: 'Cursor is malformed or expired',
      httpStatus: 400,
    });
  }
}


export class BusinessNotFoundError extends AppError {
  constructor(businessId: string) {
    super({
      code: 'BUSINESS_NOT_FOUND',
      message: `Business not found: ${businessId}`,
      httpStatus: 404,
    });
  }
}

export class BusinessNameAlreadyTakenError extends AppError {
  constructor(name: string) {
    super({
      code: 'BUSINESS_NAME_ALREADY_TAKEN',
      message: `A business with name "${name}" already exists for this owner`,
      httpStatus: 409,
    });
  }
}

export class NotBusinessOwnerError extends AppError {
  constructor() {
    super({
      code: 'NOT_BUSINESS_OWNER',
      message: 'You do not own this business',
      httpStatus: 403,
    });
  }
}

export class BusinessSuspendedError extends AppError {
  constructor(businessId: string) {
    super({
      code: 'BUSINESS_SUSPENDED',
      message: `Business is suspended: ${businessId}`,
      httpStatus: 403,
    });
  }
}


export class LocationNotFoundError extends AppError {
  constructor(locationId: string) {
    super({
      code: 'LOCATION_NOT_FOUND',
      message: `Location not found: ${locationId}`,
      httpStatus: 404,
    });
  }
}

export class LocationNameAlreadyTakenError extends AppError {
  constructor(name: string) {
    super({
      code: 'LOCATION_NAME_ALREADY_TAKEN',
      message: `A location with name "${name}" already exists for this business`,
      httpStatus: 409,
    });
  }
}


export class ServiceNotFoundError extends AppError {
  constructor(serviceId: string) {
    super({
      code: 'SERVICE_NOT_FOUND',
      message: `Service not found: ${serviceId}`,
      httpStatus: 404,
    });
  }
}

export class ServiceNameAlreadyTakenError extends AppError {
  constructor(name: string) {
    super({
      code: 'SERVICE_NAME_ALREADY_TAKEN',
      message: `A service with name "${name}" already exists for this location`,
      httpStatus: 409,
    });
  }
}

export class ServiceInactiveError extends AppError {
  constructor(serviceId: string) {
    super({
      code: 'SERVICE_INACTIVE',
      message: `Service is inactive: ${serviceId}`,
      httpStatus: 409,
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

export class ResourceNameAlreadyTakenError extends AppError {
  constructor(name: string) {
    super({
      code: 'RESOURCE_NAME_ALREADY_TAKEN',
      message: `A resource with name "${name}" already exists for this location`,
      httpStatus: 409,
    });
  }
}

export class ResourceInactiveError extends AppError {
  constructor(resourceId: string) {
    super({
      code: 'RESOURCE_INACTIVE',
      message: `Resource is inactive: ${resourceId}`,
      httpStatus: 409,
    });
  }
}


export class ServiceResourceAlreadyAssignedError extends AppError {
  constructor(serviceId: string, resourceId: string) {
    super({
      code: 'SERVICE_RESOURCE_ALREADY_ASSIGNED',
      message: `Resource ${resourceId} is already assigned to service ${serviceId}`,
      httpStatus: 409,
    });
  }
}

export class CrossLocationAssignmentError extends AppError {
  constructor() {
    super({
      code: 'CROSS_LOCATION_ASSIGNMENT',
      message: 'Service and resource must belong to the same location',
      httpStatus: 400,
    });
  }
}

export class ServiceResourceNotFoundError extends AppError {
  constructor(serviceId: string, resourceId: string) {
    super({
      code: 'SERVICE_RESOURCE_NOT_FOUND',
      message: `Assignment not found: service ${serviceId}, resource ${resourceId}`,
      httpStatus: 404,
    });
  }
}
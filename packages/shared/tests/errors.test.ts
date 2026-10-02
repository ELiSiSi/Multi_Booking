import { describe, expect, it } from 'vitest';

import {
  AppError,
  DomainError,
  InfraError,
  isAppError,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────
// AppError
// ─────────────────────────────────────────────────────────────

describe('AppError', () => {
  describe('constructor', () => {
    it('stores the provided code', () => {
      const error = new AppError({ code: 'SOME_CODE', message: 'msg' });
      expect(error.code).toBe('SOME_CODE');
    });

    it('stores the provided message', () => {
      const error = new AppError({ code: 'X', message: 'hello world' });
      expect(error.message).toBe('hello world');
    });

    it('defaults httpStatus to 500 when omitted', () => {
      const error = new AppError({ code: 'X', message: 'msg' });
      expect(error.httpStatus).toBe(500);
    });

    it('respects a custom httpStatus', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        httpStatus: 418,
      });
      expect(error.httpStatus).toBe(418);
    });

    it('defaults httpStatus to 500 when explicitly undefined', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        httpStatus: undefined,
      });
      expect(error.httpStatus).toBe(500);
    });

    it('allows httpStatus = 0 (edge, though unusual)', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        httpStatus: 0,
      });
      expect(error.httpStatus).toBe(0);
    });

    it('stores details when provided', () => {
      const details = {
        resourceId: 'r-123',
        startAt: '2026-09-25T09:00:00Z',
      };
      const error = new AppError({
        code: 'X',
        message: 'msg',
        details,
      });
      expect(error.details).toEqual(details);
    });

    it('keeps the same details reference (no deep clone)', () => {
      const details = { resourceId: 'r-123' };
      const error = new AppError({
        code: 'X',
        message: 'msg',
        details,
      });
      expect(error.details).toBe(details);
    });

    it('leaves details undefined when omitted', () => {
      const error = new AppError({ code: 'X', message: 'msg' });
      expect(error.details).toBeUndefined();
    });

    it('preserves empty object as details', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        details: {},
      });
      expect(error.details).toEqual({});
    });

    it('exposes the cause when provided', () => {
      const rootCause = new Error('underlying');
      const error = new AppError({
        code: 'X',
        message: 'msg',
        cause: rootCause,
      });
      expect((error as { cause?: unknown }).cause).toBe(rootCause);
    });

    it('exposes the cause when it is a string', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        cause: 'string cause',
      });
      expect((error as { cause?: unknown }).cause).toBe('string cause');
    });

    it('exposes the cause when it is null', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        cause: null,
      });
      expect((error as { cause?: unknown }).cause).toBeNull();
    });

    it('does not attach a meaningful cause when cause is undefined', () => {
      const error = new AppError({
        code: 'X',
        message: 'msg',
        cause: undefined,
      });
      expect((error as { cause?: unknown }).cause).toBeUndefined();
    });
  });

  describe('name', () => {
    it('uses the concrete subclass name', () => {
      class MyCustomError extends AppError {
        constructor() {
          super({ code: 'MY', message: 'mine' });
        }
      }
      expect(new MyCustomError().name).toBe('MyCustomError');
    });

    it('uses AppError for the base class itself', () => {
      expect(new AppError({ code: 'X', message: 'm' }).name).toBe('AppError');
    });
  });

  describe('inheritance', () => {
    it('is an instance of Error', () => {
      expect(new AppError({ code: 'X', message: 'm' })).toBeInstanceOf(Error);
    });

    it('captures a stack trace', () => {
      const error = new AppError({ code: 'X', message: 'm' });
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('can be caught as an Error', () => {
      try {
        throw new AppError({ code: 'X', message: 'boom' });
      } catch (caught) {
        expect(caught).toBeInstanceOf(Error);
        expect((caught as AppError).code).toBe('X');
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────
// DomainError
// ─────────────────────────────────────────────────────────────

describe('DomainError', () => {
  it('defaults httpStatus to 422', () => {
    const error = new DomainError({
      code: 'BUSINESS_RULE',
      message: 'rule violated',
    });
    expect(error.httpStatus).toBe(422);
  });

  it('allows overriding httpStatus', () => {
    const error = new DomainError({
      code: 'CUSTOM',
      message: 'msg',
      httpStatus: 409,
    });
    expect(error.httpStatus).toBe(409);
  });

  it('stores code and message', () => {
    const error = new DomainError({
      code: 'MY_CODE',
      message: 'my message',
    });
    expect(error.code).toBe('MY_CODE');
    expect(error.message).toBe('my message');
  });

  it('forwards code from opts to AppError', () => {
    const error = new DomainError({ code: 'FORWARDED', message: 'm' });
    expect(error.code).toBe('FORWARDED');
  });

  it('forwards message from opts to AppError', () => {
    const error = new DomainError({ code: 'X', message: 'forwarded message' });
    expect(error.message).toBe('forwarded message');
  });

  it('forwards details from opts to AppError', () => {
    const details = { from: 'pending', to: 'cancelled' };
    const error = new DomainError({ code: 'X', message: 'm', details });
    expect(error.details).toBe(details);
  });

  it('forwards cause from opts to AppError', () => {
    const cause = new Error('root');
    const error = new DomainError({ code: 'X', message: 'm', cause });
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it('preserves details and cause together', () => {
    const cause = new Error('root');
    const error = new DomainError({
      code: 'X',
      message: 'm',
      details: { a: 1 },
      cause,
    });
    expect(error.details).toEqual({ a: 1 });
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it('is an instance of AppError', () => {
    expect(new DomainError({ code: 'X', message: 'm' })).toBeInstanceOf(
      AppError,
    );
  });

  it('is an instance of Error', () => {
    expect(new DomainError({ code: 'X', message: 'm' })).toBeInstanceOf(Error);
  });

  it('has name DomainError', () => {
    expect(new DomainError({ code: 'X', message: 'm' }).name).toBe(
      'DomainError',
    );
  });
});

// ─────────────────────────────────────────────────────────────
// InfraError
// ─────────────────────────────────────────────────────────────

describe('InfraError', () => {
  it('defaults httpStatus to 503', () => {
    const error = new InfraError({
      code: 'DB_DOWN',
      message: 'db unavailable',
    });
    expect(error.httpStatus).toBe(503);
  });

  it('allows overriding httpStatus', () => {
    const error = new InfraError({
      code: 'CUSTOM',
      message: 'msg',
      httpStatus: 504,
    });
    expect(error.httpStatus).toBe(504);
  });

  it('stores code and message', () => {
    const error = new InfraError({
      code: 'REDIS_DOWN',
      message: 'redis unavailable',
    });
    expect(error.code).toBe('REDIS_DOWN');
    expect(error.message).toBe('redis unavailable');
  });

  it('forwards code from opts to AppError', () => {
    const error = new InfraError({ code: 'FORWARDED', message: 'm' });
    expect(error.code).toBe('FORWARDED');
  });

  it('forwards message from opts to AppError', () => {
    const error = new InfraError({ code: 'X', message: 'forwarded message' });
    expect(error.message).toBe('forwarded message');
  });

  it('forwards details from opts to AppError', () => {
    const details = { host: 'redis', port: 6379 };
    const error = new InfraError({ code: 'X', message: 'm', details });
    expect(error.details).toBe(details);
  });

  it('forwards cause from opts to AppError', () => {
    const cause = new Error('socket closed');
    const error = new InfraError({ code: 'X', message: 'm', cause });
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it('preserves details and cause together', () => {
    const cause = new Error('socket closed');
    const error = new InfraError({
      code: 'X',
      message: 'm',
      details: { host: 'redis' },
      cause,
    });
    expect(error.details).toEqual({ host: 'redis' });
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it('is an instance of AppError', () => {
    expect(new InfraError({ code: 'X', message: 'm' })).toBeInstanceOf(
      AppError,
    );
  });

  it('is an instance of Error', () => {
    expect(new InfraError({ code: 'X', message: 'm' })).toBeInstanceOf(Error);
  });

  it('has name InfraError', () => {
    expect(new InfraError({ code: 'X', message: 'm' }).name).toBe(
      'InfraError',
    );
  });
});

// ─────────────────────────────────────────────────────────────
// isAppError — type guard
// ─────────────────────────────────────────────────────────────

describe('isAppError', () => {
  it('returns true for an AppError instance', () => {
    expect(isAppError(new AppError({ code: 'X', message: 'm' }))).toBe(true);
  });

  it('returns true for a DomainError instance', () => {
    expect(isAppError(new DomainError({ code: 'X', message: 'm' }))).toBe(
      true,
    );
  });

  it('returns true for an InfraError instance', () => {
    expect(isAppError(new InfraError({ code: 'X', message: 'm' }))).toBe(
      true,
    );
  });

  it('returns true for a subclass of AppError', () => {
    class CustomError extends AppError {
      constructor() {
        super({ code: 'X', message: 'm' });
      }
    }
    expect(isAppError(new CustomError())).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isAppError(new Error('plain'))).toBe(false);
  });

  it('returns false for a plain TypeError', () => {
    expect(isAppError(new TypeError('bad type'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAppError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAppError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isAppError('error')).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isAppError(500)).toBe(false);
  });

  it('returns false for a plain object that looks like an AppError', () => {
    expect(isAppError({ code: 'X', message: 'm', httpStatus: 500 })).toBe(
      false,
    );
  });

  it('narrows the type inside an if-statement', () => {
    const value: unknown = new AppError({ code: 'X', message: 'm' });

    if (isAppError(value)) {
      expect(value.code).toBe('X');
      expect(value.httpStatus).toBe(500);
    } else {
      throw new Error('expected isAppError to be true');
    }
  });

  it('narrows the type inside try/catch', () => {
    try {
      throw new AppError({ code: 'CAUGHT', message: 'caught' });
    } catch (caught) {
      if (isAppError(caught)) {
        expect(caught.code).toBe('CAUGHT');
      } else {
        throw new Error('expected isAppError to be true');
      }
    }
  });
});
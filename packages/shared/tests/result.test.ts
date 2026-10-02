import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, ok, type Result } from '../src/index.js';

// ─────────────────────────────────────────────────────────────
// ok()
// ─────────────────────────────────────────────────────────────

describe('ok()', () => {
  it('wraps a number', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(42);
  });

  it('wraps a string', () => {
    const r = ok('hello');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe('hello');
  });

  it('wraps a boolean', () => {
    expect(ok(true).ok).toBe(true);
    expect(ok(false).ok).toBe(true);
  });

  it('wraps null', () => {
    const r = ok(null);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeNull();
  });

  it('wraps undefined', () => {
    const r = ok(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeUndefined();
  });

  it('wraps an object and keeps the same reference', () => {
    const payload = { id: 'booking-1', status: 'pending' };
    const r = ok(payload);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(payload);
  });

  it('wraps an array', () => {
    const payload = [1, 2, 3];
    const r = ok(payload);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(payload);
  });

  it('wraps a Date', () => {
    const date = new Date('2026-09-25T09:00:00Z');
    const r = ok(date);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(date);
  });

  it('has ok = true as literal type', () => {
    const r = ok(1);
    expect(r.ok).toBe(true);
    expect('value' in r).toBe(true);
    expect('error' in r).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// err()
// ─────────────────────────────────────────────────────────────

describe('err()', () => {
  it('wraps a string error', () => {
    const r = err('something failed');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('something failed');
  });

  it('wraps an Error instance', () => {
    const error = new Error('boom');
    const r = err(error);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it('wraps a custom error code object', () => {
    const error = { code: 'BOOKING_SLOT_CONFLICT', message: 'conflict' };
    const r = err(error);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(error);
  });

  it('wraps null as error', () => {
    const r = err(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeNull();
  });

  it('has ok = false as literal type', () => {
    const r = err('x');
    expect(r.ok).toBe(false);
    expect('error' in r).toBe(true);
    expect('value' in r).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// isOk()
// ─────────────────────────────────────────────────────────────

describe('isOk()', () => {
  it('returns true for an ok result', () => {
    expect(isOk(ok(1))).toBe(true);
  });

  it('returns false for an err result', () => {
    expect(isOk(err('x'))).toBe(false);
  });

  it('narrows the type so .value is accessible', () => {
    const r: Result<number, string> = ok(42);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    } else {
      throw new Error('expected isOk to be true');
    }
  });

  it('works with void payload', () => {
    const r: Result<void, string> = ok(undefined);
    expect(isOk(r)).toBe(true);
  });

  it('works with complex payload', () => {
    const payload = { id: 'b-1', resourceId: 'r-1' };
    const r: Result<typeof payload, Error> = ok(payload);
    if (isOk(r)) {
      expect(r.value.id).toBe('b-1');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// isErr()
// ─────────────────────────────────────────────────────────────

describe('isErr()', () => {
  it('returns true for an err result', () => {
    expect(isErr(err('x'))).toBe(true);
  });

  it('returns false for an ok result', () => {
    expect(isErr(ok(1))).toBe(false);
  });

  it('narrows the type so .error is accessible', () => {
    const r: Result<number, string> = err('failure');
    if (isErr(r)) {
      expect(r.error).toBe('failure');
    } else {
      throw new Error('expected isErr to be true');
    }
  });

  it('works with Error instance', () => {
    const error = new Error('boom');
    const r: Result<number, Error> = err(error);
    if (isErr(r)) {
      expect(r.error).toBe(error);
      expect(r.error.message).toBe('boom');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Type narrowing
// ─────────────────────────────────────────────────────────────

describe('type narrowing', () => {
  it('isOk and isErr are mutually exclusive', () => {
    const r: Result<number, string> = ok(1);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);

    const r2: Result<number, string> = err('x');
    expect(isOk(r2)).toBe(false);
    expect(isErr(r2)).toBe(true);
  });

  it('supports switch-like handling via if/else', () => {
    const r: Result<number, string> = ok(7);

    let value: number | undefined;
    let error: string | undefined;

    if (isOk(r)) value = r.value;
    else error = r.error;

    expect(value).toBe(7);
    expect(error).toBeUndefined();
  });

  it('supports early-return pattern', () => {
    function process(r: Result<number, string>): number {
      if (isErr(r)) return -1;
      return r.value;
    }

    expect(process(ok(10))).toBe(10);
    expect(process(err('x'))).toBe(-1);
  });

  it('supports discriminated union exhaustiveness', () => {
    const r: Result<number, string> = ok(5);

    const outcome = r.ok ? `ok:${r.value}` : `err:${r.error}`;
    expect(outcome).toBe('ok:5');
  });
});

// ─────────────────────────────────────────────────────────────
// Realistic usage
// ─────────────────────────────────────────────────────────────

describe('realistic usage', () => {
  it('models a booking creation result', () => {
    type BookingResult = Result<
      { id: string; status: 'pending' },
      { code: string; message: string }
    >;

    function createBooking(valid: boolean): BookingResult {
      if (!valid) {
        return err({
          code: 'BOOKING_SLOT_CONFLICT',
          message: 'slot already booked',
        });
      }
      return ok({ id: 'b-1', status: 'pending' as const });
    }

    const success = createBooking(true);
    expect(isOk(success)).toBe(true);

    const failure = createBooking(false);
    expect(isErr(failure)).toBe(true);
    if (isErr(failure)) {
      expect(failure.error.code).toBe('BOOKING_SLOT_CONFLICT');
    }
  });

  it('works with default E = Error', () => {
    const r: Result<number> = err(new Error('default type'));
    if (isErr(r)) {
      expect(r.error.message).toBe('default type');
    }
  });
});
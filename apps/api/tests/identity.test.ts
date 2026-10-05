import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, RefreshToken } from '@reservio/database';

import {
  Argon2PasswordHasher,
  AuthorizationPolicy,
  generateRefreshToken,
  sha256,
  type Actor,
} from '../src/modules/identity/use-cases/_support.js';

import {
  EmailAlreadyRegisteredError,
  ForbiddenError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  UnauthenticatedError,
} from '../src/modules/identity/use-cases/identity.errors.js';

import { RegisterUserUseCase } from '../src/modules/identity/use-cases/register-user.use-case.js';
import { LoginUseCase } from '../src/modules/identity/use-cases/login.use-case.js';
import { RefreshTokenUseCase } from '../src/modules/identity/use-cases/refresh-token.use-case.js';
import { LogoutUseCase } from '../src/modules/identity/use-cases/logout.use-case.js';

import type { UserRepository } from '../src/modules/identity/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../src/modules/identity/repositories/refresh-token.repository.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed',
    fullName: 'Test User',
    role: 'customer',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

function makeToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 'token-1',
    userId: 'user-1',
    tokenHash: 'hash-1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    createdAt: new Date(),
    ...overrides,
  } as RefreshToken;
}

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes a password to a PHC string', async () => {
    const hash = await hasher.hash('secret');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces different hashes for the same input', async () => {
    const a = await hasher.hash('same');
    const b = await hasher.hash('same');
    expect(a).not.toBe(b);
  });

  it('verifies the correct password', async () => {
    const hash = await hasher.hash('my-password');
    expect(await hasher.verify('my-password', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hasher.hash('my-password');
    expect(await hasher.verify('wrong', hash)).toBe(false);
  });
});

describe('AuthorizationPolicy', () => {
  const policy = new AuthorizationPolicy();

  describe('canAsAdmin', () => {
    it('returns true when the admin owns the business', () => {
      const actor: Actor = { userId: 'a-1', role: 'admin' };
      expect(policy.canAsAdmin(actor, 'b-1', new Set(['b-1', 'b-2']))).toBe(true);
    });

    it('returns false when the admin does not own the business', () => {
      const actor: Actor = { userId: 'a-1', role: 'admin' };
      expect(policy.canAsAdmin(actor, 'b-99', new Set(['b-1']))).toBe(false);
    });

    it('returns false for a customer', () => {
      const actor: Actor = { userId: 'c-1', role: 'customer' };
      expect(policy.canAsAdmin(actor, 'b-1', new Set(['b-1']))).toBe(false);
    });

    it('returns false with an empty owned set', () => {
      const actor: Actor = { userId: 'a-1', role: 'admin' };
      expect(policy.canAsAdmin(actor, 'b-1', new Set())).toBe(false);
    });
  });


});

describe('sha256', () => {
  it('returns a 64-char hex string', () => {
    expect(sha256('x')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(sha256('x')).toBe(sha256('x'));
  });

  it('changes with input', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});

describe('generateRefreshToken', () => {
  it('returns raw / hash / expiresAt', () => {
    const t = generateRefreshToken();
    expect(t.raw).toBeTruthy();
    expect(t.hash).toBeTruthy();
    expect(t.expiresAt).toBeInstanceOf(Date);
  });

  it('raw is URL-safe base64', () => {
    expect(generateRefreshToken().raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hash equals sha256(raw)', () => {
    const t = generateRefreshToken();
    expect(t.hash).toBe(sha256(t.raw));
  });

  it('produces a unique token each call', () => {
    expect(generateRefreshToken().raw).not.toBe(generateRefreshToken().raw);
  });

  it('expires roughly 30 days from now', () => {
    const before = Date.now();
    const t = generateRefreshToken();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    expect(t.expiresAt.getTime() - before).toBeGreaterThan(days30 - 10_000);
    expect(t.expiresAt.getTime() - before).toBeLessThan(days30 + 10_000);
  });
});

describe('identity errors', () => {
  const cases = [
    { Err: EmailAlreadyRegisteredError, code: 'EMAIL_ALREADY_REGISTERED', http: 409 },
    { Err: InvalidCredentialsError, code: 'INVALID_CREDENTIALS', http: 401 },
    { Err: InvalidRefreshTokenError, code: 'INVALID_REFRESH_TOKEN', http: 401 },
    { Err: UnauthenticatedError, code: 'UNAUTHENTICATED', http: 401 },
  ];

  for (const { Err, code, http } of cases) {
    it(`${code} has the right status`, () => {
      const e = new Err();
      expect(e.code).toBe(code);
      expect(e.httpStatus).toBe(http);
    });
  }

  it('ForbiddenError defaults to a message + 403', () => {
    const e = new ForbiddenError();
    expect(e.code).toBe('FORBIDDEN');
    expect(e.httpStatus).toBe(403);
  });

  it('ForbiddenError accepts a custom message', () => {
    const e = new ForbiddenError('not allowed here');
    expect(e.message).toBe('not allowed here');
  });
});

describe('RegisterUserUseCase', () => {
  let users: UserRepository;
  let hasher: Argon2PasswordHasher;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      existsByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      ownedBusinessIds: vi.fn(),
    } as unknown as UserRepository;

    hasher = new Argon2PasswordHasher();
    useCase = new RegisterUserUseCase(users, hasher);
  });

  it('normalizes email before storing', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (users.create as ReturnType<typeof vi.fn>).mockImplementation(async (data) =>
      makeUser({ email: data.email, fullName: data.fullName }),
    );

    await useCase.execute({
      email: '  MixedCase@Example.COM  ',
      password: 'password123',
      fullName: '  Alice  ',
    });

    expect(users.findByEmail).toHaveBeenCalledWith('mixedcase@example.com');
    const createArg = (users.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArg.email).toBe('mixedcase@example.com');
    expect(createArg.fullName).toBe('Alice');
  });

  it('always sets role to customer', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (users.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeUser());

    await useCase.execute({
      email: 'a@b.com',
      password: 'pw',
      fullName: 'X',
    });

    const createArg = (users.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArg.role).toBe('customer');
  });

  it('hashes the password (not stored in plaintext)', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (users.create as ReturnType<typeof vi.fn>).mockResolvedValue(makeUser());

    await useCase.execute({
      email: 'a@b.com',
      password: 'plaintext-pw',
      fullName: 'X',
    });

    const createArg = (users.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createArg.passwordHash).not.toBe('plaintext-pw');
    expect(createArg.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects an email that already exists', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ email: 'x@y.com', password: 'pw', fullName: 'N' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('catches P2002 race condition', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (users.create as ReturnType<typeof vi.fn>).mockRejectedValue({ code: 'P2002' });

    await expect(
      useCase.execute({ email: 'x@y.com', password: 'pw', fullName: 'N' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('rethrows non-P2002 errors', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (users.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));

    await expect(
      useCase.execute({ email: 'x@y.com', password: 'pw', fullName: 'N' }),
    ).rejects.toThrow('boom');
  });
});

describe('LoginUseCase', () => {
  let users: UserRepository;
  let hasher: Argon2PasswordHasher;
  let useCase: LoginUseCase;
  let dummyHash: string;

  beforeEach(async () => {
    users = {
      findByEmail: vi.fn(),
      existsByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      ownedBusinessIds: vi.fn(),
    } as unknown as UserRepository;

    hasher = new Argon2PasswordHasher();
    dummyHash = await hasher.hash('dummy-password');
    useCase = new LoginUseCase(users, hasher, dummyHash);
  });

  it('returns the user on valid credentials', async () => {
    const realHash = await hasher.hash('correct-pw');
    const user = makeUser({ passwordHash: realHash });
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(user);

    const result = await useCase.execute({
      email: 'TEST@example.com',
      password: 'correct-pw',
    });

    expect(result.id).toBe(user.id);
    expect(users.findByEmail).toHaveBeenCalledWith('test@example.com');
  });

  it('rejects a wrong password', async () => {
    const realHash = await hasher.hash('correct-pw');
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUser({ passwordHash: realHash }),
    );

    await expect(
      useCase.execute({ email: 'a@b.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects an unknown email', async () => {
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'ghost@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects a SUSPENDED account', async () => {
    const realHash = await hasher.hash('pw');
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUser({ passwordHash: realHash, status: 'SUSPENDED' }),
    );

    await expect(
      useCase.execute({ email: 'a@b.com', password: 'pw' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('always runs hasher.verify (constant-time)', async () => {
    const spy = vi.spyOn(hasher, 'verify');
    (users.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'ghost@b.com', password: 'pw' }),
    ).rejects.toThrow();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('pw', dummyHash);
  });
});

describe('RefreshTokenUseCase', () => {
  let users: UserRepository;
  let tokens: RefreshTokenRepository;
  let useCase: RefreshTokenUseCase;

  beforeEach(() => {
    users = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      existsByEmail: vi.fn(),
      create: vi.fn(),
      ownedBusinessIds: vi.fn(),
    } as unknown as UserRepository;

    tokens = {
      findByHash: vi.fn(),
      create: vi.fn(),
      rotate: vi.fn(),
      revoke: vi.fn(),
    } as unknown as RefreshTokenRepository;

    useCase = new RefreshTokenUseCase(users, tokens);
  });

  it('rejects an unknown token', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute({ rawRefreshToken: 'ghost-token' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rejects a revoked token', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeToken({ revokedAt: new Date() }),
    );

    await expect(
      useCase.execute({ rawRefreshToken: 'revoked' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rejects an expired token', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeToken({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      useCase.execute({ rawRefreshToken: 'expired' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rejects when user is missing', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(makeToken());
    (users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute({ rawRefreshToken: 'valid' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rejects when user is suspended', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(makeToken());
    (users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeUser({ status: 'SUSPENDED' }),
    );

    await expect(
      useCase.execute({ rawRefreshToken: 'valid' }),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rotates on success', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(makeToken());
    (users.findById as ReturnType<typeof vi.fn>).mockResolvedValue(makeUser());
    (tokens.rotate as ReturnType<typeof vi.fn>).mockResolvedValue(makeToken({ id: 'new' }));

    const result = await useCase.execute({ rawRefreshToken: 'valid' });

    expect(result.user).toBeDefined();
    expect(result.newRefreshToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(tokens.rotate).toHaveBeenCalledTimes(1);

    const rotateArg = (tokens.rotate as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(rotateArg.oldId).toBe('token-1');
    expect(rotateArg.newToken.userId).toBe('user-1');
  });

  it('hashes the presented token before lookup', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      useCase.execute({ rawRefreshToken: 'raw-value' }),
    ).rejects.toThrow();

    expect(tokens.findByHash).toHaveBeenCalledWith(sha256('raw-value'));
  });
});

describe('LogoutUseCase', () => {
  let tokens: RefreshTokenRepository;
  let useCase: LogoutUseCase;

  beforeEach(() => {
    tokens = {
      findByHash: vi.fn(),
      create: vi.fn(),
      rotate: vi.fn(),
      revoke: vi.fn(),
    } as unknown as RefreshTokenRepository;

    useCase = new LogoutUseCase(tokens);
  });

  it('does nothing when no token is provided', async () => {
    await useCase.execute({});
    expect(tokens.findByHash).not.toHaveBeenCalled();
    expect(tokens.revoke).not.toHaveBeenCalled();
  });

  it('does nothing when token is unknown', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await useCase.execute({ rawRefreshToken: 'ghost' });

    expect(tokens.revoke).not.toHaveBeenCalled();
  });

  it('revokes a valid active token', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(makeToken());
    (tokens.revoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await useCase.execute({ rawRefreshToken: 'valid' });

    expect(tokens.revoke).toHaveBeenCalledWith('token-1');
  });

  it('does not re-revoke an already-revoked token', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeToken({ revokedAt: new Date() }),
    );

    await useCase.execute({ rawRefreshToken: 'already-revoked' });

    expect(tokens.revoke).not.toHaveBeenCalled();
  });

  it('is idempotent', async () => {
    (tokens.findByHash as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await useCase.execute({ rawRefreshToken: 'x' });
    await useCase.execute({ rawRefreshToken: 'x' });

    expect(tokens.findByHash).toHaveBeenCalledTimes(2);
  });
});


// ═════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASES
// ═════════════════════════════════════════════════════════════

describe('Argon2PasswordHasher — edge cases', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes an empty password', async () => {
    const hash = await hasher.hash('');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('verifies an empty password against its own hash', async () => {
    const hash = await hasher.hash('');
    expect(await hasher.verify('', hash)).toBe(true);
  });

  it('hashes unicode passwords', async () => {
    const hash = await hasher.hash('كلمة السر 🎉');
    expect(await hasher.verify('كلمة السر 🎉', hash)).toBe(true);
  });

  it('hashes a very long password (1000 chars)', async () => {
    const long = 'a'.repeat(1000);
    const hash = await hasher.hash(long);
    expect(await hasher.verify(long, hash)).toBe(true);
  });

  it('returns false for a malformed hash string', async () => {
    const ok = await hasher.verify('anything', 'not-a-valid-hash');
    expect(ok).toBe(false);
  });

  it('returns false for an empty hash string', async () => {
    const ok = await hasher.verify('anything', '');
    expect(ok).toBe(false);
  });
});

describe('RegisterUserUseCase — edge cases', () => {
  let users: UserRepository;
  let hasher: Argon2PasswordHasher;
  let useCase: RegisterUserUseCase;

  beforeEach(() => {
    users = {
      findByEmail: vi.fn(),
      existsByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      ownedBusinessIds: vi.fn(),
    } as unknown as UserRepository;

    hasher = new Argon2PasswordHasher();
    useCase = new RegisterUserUseCase(users, hasher);
  });

  it('preserves unicode in fullName', async () => {
    (users.findByEmail as any).mockResolvedValue(null);
    (users.create as any).mockImplementation(async (data: any) => makeUser(data));

    await useCase.execute({
      email: 'user@example.com',
      password: 'pw',
      fullName: ' أحمد محمود ',
    });

    const createArg = (users.create as any).mock.calls[0][0];
    expect(createArg.fullName).toBe('أحمد محمود');
  });

  it('lowercases ASCII email but keeps the rest', async () => {
    (users.findByEmail as any).mockResolvedValue(null);
    (users.create as any).mockImplementation(async (data: any) => makeUser(data));

    await useCase.execute({
      email: 'AHMED@EXAMPLE.COM',
      password: 'pw',
      fullName: 'X',
    });

    expect(users.findByEmail).toHaveBeenCalledWith('ahmed@example.com');
  });

  it('normalizes both sides of the email (leading/trailing + case)', async () => {
    (users.findByEmail as any).mockResolvedValue(null);
    (users.create as any).mockImplementation(async (data: any) => makeUser(data));

    await useCase.execute({
      email: '  A@B.COM  ',
      password: 'pw',
      fullName: 'X',
    });

    const createArg = (users.create as any).mock.calls[0][0];
    expect(createArg.email).toBe('a@b.com');
  });

  it('calls findByEmail before create (pre-check)', async () => {
    (users.findByEmail as any).mockResolvedValue(null);
    (users.create as any).mockResolvedValue(makeUser());

    await useCase.execute({ email: 'a@b.com', password: 'pw', fullName: 'X' });

    const findOrder = (users.findByEmail as any).mock.invocationCallOrder[0];
    const createOrder = (users.create as any).mock.invocationCallOrder[0];
    expect(findOrder).toBeLessThan(createOrder);
  });

  it('does not call create when email already exists', async () => {
    (users.findByEmail as any).mockResolvedValue(makeUser());

    await expect(
      useCase.execute({ email: 'taken@x.com', password: 'pw', fullName: 'X' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    expect(users.create).not.toHaveBeenCalled();
  });
});

describe('LoginUseCase — edge cases', () => {
  let users: UserRepository;
  let hasher: Argon2PasswordHasher;
  let useCase: LoginUseCase;
  let dummyHash: string;

  beforeEach(async () => {
    users = {
      findByEmail: vi.fn(),
      existsByEmail: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      ownedBusinessIds: vi.fn(),
    } as unknown as UserRepository;

    hasher = new Argon2PasswordHasher();
    dummyHash = await hasher.hash('dummy');
    useCase = new LoginUseCase(users, hasher, dummyHash);
  });

  it('trims whitespace before lookup', async () => {
    (users.findByEmail as any).mockResolvedValue(null);

    await expect(
      useCase.execute({ email: '  a@b.com  ', password: 'pw' }),
    ).rejects.toThrow();

    expect(users.findByEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('lowercases email before lookup', async () => {
    (users.findByEmail as any).mockResolvedValue(null);

    await expect(
      useCase.execute({ email: 'UPPER@CASE.COM', password: 'pw' }),
    ).rejects.toThrow();

    expect(users.findByEmail).toHaveBeenCalledWith('upper@case.com');
  });

  it('rejects empty password', async () => {
    const realHash = await hasher.hash('real-pw');
    (users.findByEmail as any).mockResolvedValue(makeUser({ passwordHash: realHash }));

    await expect(
      useCase.execute({ email: 'a@b.com', password: '' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects empty email', async () => {
    (users.findByEmail as any).mockResolvedValue(null);

    await expect(
      useCase.execute({ email: '', password: 'pw' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('AuthorizationPolicy — edge cases', () => {
  const policy = new AuthorizationPolicy();

  it('handles multiple owned businesses', () => {
    const actor: Actor = { userId: 'a-1', role: 'admin' };
    const owned = new Set(['b-1', 'b-2', 'b-3']);
    expect(policy.canAsAdmin(actor, 'b-2', owned)).toBe(true);
    expect(policy.canAsAdmin(actor, 'b-4', owned)).toBe(false);
  });

  it('is case-sensitive on business IDs', () => {
    const actor: Actor = { userId: 'a-1', role: 'admin' };
    const owned = new Set(['ABC-123']);
    expect(policy.canAsAdmin(actor, 'abc-123', owned)).toBe(false);
  });
});

describe('generateRefreshToken — edge cases', () => {
  it('generates 100 unique tokens', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateRefreshToken().raw);
    }
    expect(tokens.size).toBe(100);
  });

  it('raw token is at least 40 chars long', () => {
    expect(generateRefreshToken().raw.length).toBeGreaterThanOrEqual(40);
  });

  it('expiresAt is always in the future', () => {
    expect(generateRefreshToken().expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('identity errors — inheritance', () => {
  it('all auth errors are instanceof AppError', async () => {
    const { AppError } = await import('@reservio/shared');

    expect(new EmailAlreadyRegisteredError()).toBeInstanceOf(AppError);
    expect(new InvalidCredentialsError()).toBeInstanceOf(AppError);
    expect(new InvalidRefreshTokenError()).toBeInstanceOf(AppError);
    expect(new UnauthenticatedError()).toBeInstanceOf(AppError);
    expect(new ForbiddenError()).toBeInstanceOf(AppError);
  });

  it('all auth errors have a message', () => {
    expect(new EmailAlreadyRegisteredError().message).toBeTruthy();
    expect(new InvalidCredentialsError().message).toBeTruthy();
    expect(new InvalidRefreshTokenError().message).toBeTruthy();
    expect(new UnauthenticatedError().message).toBeTruthy();
    expect(new ForbiddenError().message).toBeTruthy();
  });
});
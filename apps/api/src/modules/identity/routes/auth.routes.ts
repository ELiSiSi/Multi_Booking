import type { FastifyInstance, FastifyReply } from 'fastify';
import '@fastify/cookie';

import { generateRefreshToken, REFRESH_TOKEN_TTL_S } from '../use-cases/_support.js';
import type { IdentityModule } from '../identity.module.js';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'fullName'],
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 320 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
      fullName: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
} as const;

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', minLength: 1, maxLength: 320 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
} as const;

function setRefreshCookie(reply: FastifyReply, raw: string): void {
  reply.setCookie(REFRESH_COOKIE, raw, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_TOKEN_TTL_S,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

function toPublicUser(user: {
  id: string;
  email: string;
  fullName: string;
  role: string;
}) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  identity: IdentityModule,
): void {
  // ─── POST /auth/register ───────────────────────────────
  app.post(
    '/auth/register',
    { schema: registerSchema },
    async (request, reply) => {
      const body = request.body as {
        email: string;
        password: string;
        fullName: string;
      };

      const user = await identity.register.execute(body);

      const accessToken = app.jwt.sign({ sub: user.id, role: user.role });

      const fresh = generateRefreshToken();
      await identity.refreshTokens.create({
        userId: user.id,
        tokenHash: fresh.hash,
        expiresAt: fresh.expiresAt,
        userAgent: request.headers['user-agent'],
      });

      setRefreshCookie(reply, fresh.raw);

      return reply.code(201).send({
        user: toPublicUser(user),
        accessToken,
      });
    },
  );

  // ─── POST /auth/login ──────────────────────────────────
  app.post(
    '/auth/login',
    { schema: loginSchema },
    async (request, reply) => {
      const body = request.body as { email: string; password: string };

      const user = await identity.login.execute(body);

      const accessToken = app.jwt.sign({ sub: user.id, role: user.role });

      const fresh = generateRefreshToken();
      await identity.refreshTokens.create({
        userId: user.id,
        tokenHash: fresh.hash,
        expiresAt: fresh.expiresAt,
        userAgent: request.headers['user-agent'],
      });

      setRefreshCookie(reply, fresh.raw);

      return reply.send({
        user: toPublicUser(user),
        accessToken,
      });
    },
  );

  // ─── POST /auth/refresh ────────────────────────────────
  app.post('/auth/refresh', async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    if (!raw) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or has expired.',
        },
      });
    }

    const { user, newRefreshToken } = await identity.refresh.execute({
      rawRefreshToken: raw,
      userAgent: request.headers['user-agent'],
    });

    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
    setRefreshCookie(reply, newRefreshToken);

    return reply.send({ accessToken });
  });

  // ─── POST /auth/logout ─────────────────────────────────
  app.post('/auth/logout', async (request, reply) => {
    const raw = request.cookies[REFRESH_COOKIE];
    await identity.logout.execute({ rawRefreshToken: raw });
    clearRefreshCookie(reply);
    return reply.code(204).send();
  });

  // ─── GET /auth/me ──────────────────────────────────────
  app.get(
    '/auth/me',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const actor = request.actor!;
      const user = await identity.users.findById(actor.userId);

      if (!user) {
        return reply.code(401).send({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Authentication required.',
          },
        });
      }

      return reply.send({ user: toPublicUser(user) });
    },
  );
}

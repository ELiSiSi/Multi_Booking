# 📦 Project Code Collection / مجمع أكواد المشروع

> 📌 تم إنشاء نسخة باللغة العربية باسم: [اكواد_المشروع.md](file:///d:/0My%20%20Project%20Work/Multi_Booking/Multi_Booking/%D8%A7%D9%83%D9%88%D8%A7%D8%AF_%D8%A7%D9%84%D9%85%D8%B4%D8%B1%D9%88%D8%B9.md)

---

## 📁 الحزمة: `packages/config`

### 1️⃣ `packages/config/package.json`
**المسار الكامل:** `d:\0My  Project Work\Multi_Booking\Multi_Booking\packages\config\package.json`

```json
{
  "name": "@reservio/config",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3"
  }
}
```

---

### 2️⃣ `packages/config/tsconfig.json`
**المسار الكامل:** `d:\0My  Project Work\Multi_Booking\Multi_Booking\packages\config\tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

---

### 3️⃣ `packages/config/src/env.schema.ts`
**المسار الكامل:** `d:\0My  Project Work\Multi_Booking\Multi_Booking\packages\config\src\env.schema.ts`

```typescript
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  ACCESS_TOKEN_PRIVATE_KEY: z.string().min(1),
  ACCESS_TOKEN_PUBLIC_KEY: z.string().min(1),
  JWT_ISSUER: z.string().default('reservio'),
  JWT_AUDIENCE: z.string().default('reservio-api'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;
```

---

### 4️⃣ `packages/config/src/env.ts`
**المسار الكامل:** `d:\0My  Project Work\Multi_Booking\Multi_Booking\packages\config\src\env.ts`

```typescript
import { envSchema, type Env } from './env.schema.js';

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}
```

---

### 5️⃣ `packages/config/src/index.ts`
**المسار الكامل:** `d:\0My  Project Work\Multi_Booking\Multi_Booking\packages\config\src\index.ts`

```typescript
export * from './env.schema.js';
export * from './env.js';
```

---

### 6️⃣ `packages/config/tests/env-schema.test.ts`
**المسار الكامل:** `d:\0My  Project Work\Multi_Booking\Multi_Booking\packages\config\tests\env-schema.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { envSchema } from '../src/env.schema.js';

describe('envSchema', () => {
  const validEnv = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_URL: 'redis://localhost:6379',
    ACCESS_TOKEN_PRIVATE_KEY: 'private-key',
    ACCESS_TOKEN_PUBLIC_KEY: 'public-key',
  };

  it('accepts a minimal valid environment with defaults applied', () => {
    const result = envSchema.safeParse(validEnv);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.NODE_ENV).toBe('development');
    expect(result.data.API_PORT).toBe(3000);
    expect(result.data.API_HOST).toBe('0.0.0.0');
    expect(result.data.JWT_ISSUER).toBe('reservio');
    expect(result.data.JWT_AUDIENCE).toBe('reservio-api');
    expect(result.data.WORKER_CONCURRENCY).toBe(5);
  });

  it('coerces numeric strings to numbers', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      API_PORT: '4000',
      WORKER_CONCURRENCY: '10',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.API_PORT).toBe(4000);
    expect(result.data.WORKER_CONCURRENCY).toBe(10);
  });

  it('rejects an invalid DATABASE_URL', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      DATABASE_URL: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid REDIS_URL', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      REDIS_URL: 'not-a-url',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL, ...incomplete } = validEnv;
    const result = envSchema.safeParse(incomplete);

    expect(result.success).toBe(false);
  });

  it('rejects an empty ACCESS_TOKEN_PRIVATE_KEY', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      ACCESS_TOKEN_PRIVATE_KEY: '',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown NODE_ENV value', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      NODE_ENV: 'staging',
    });

    expect(result.success).toBe(false);
  });
});
```

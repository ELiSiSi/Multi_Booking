import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeRedis, redis } from '../src/index.js';

describe('redis client', () => {
  // ─────────────────────────────────────────────────────────
  // Setup / teardown
  // ─────────────────────────────────────────────────────────

  beforeAll(async () => {
    // Make sure the connection is established before tests run
    await redis.ping();
  });

  afterAll(async () => {
    // Clean up any leftover test keys before closing
    const keys = await redis.keys('test:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // ─────────────────────────────────────────────────────────
  // Connection
  // ─────────────────────────────────────────────────────────

  it('connects to Redis and responds to PING', async () => {
    const response = await redis.ping();
    expect(response).toBe('PONG');
  });

  it('reports connection status as ready', () => {
    expect(redis.status).toBe('ready');
  });

  // ─────────────────────────────────────────────────────────
  // Basic commands
  // ─────────────────────────────────────────────────────────

  it('sets and gets a string value', async () => {
    await redis.set('test:greeting', 'hello');
    const value = await redis.get('test:greeting');
    expect(value).toBe('hello');
  });

  it('returns null for a missing key', async () => {
    const value = await redis.get('test:does-not-exist');
    expect(value).toBeNull();
  });

  it('deletes a key', async () => {
    await redis.set('test:to-delete', 'value');
    const deleted = await redis.del('test:to-delete');
    expect(deleted).toBe(1);

    const value = await redis.get('test:to-delete');
    expect(value).toBeNull();
  });

  it('checks key existence', async () => {
    await redis.set('test:exists', 'yes');
    expect(await redis.exists('test:exists')).toBe(1);

    await redis.del('test:exists');
    expect(await redis.exists('test:exists')).toBe(0);
  });

  // ─────────────────────────────────────────────────────────
  // JSON values (how we'll use it for slot cache)
  // ─────────────────────────────────────────────────────────

  it('stores and retrieves JSON', async () => {
    const payload = {
      slots: [
        { startAt: '2026-09-25T09:00:00Z', endAt: '2026-09-25T09:30:00Z' },
        { startAt: '2026-09-25T09:30:00Z', endAt: '2026-09-25T10:00:00Z' },
      ],
    };

    await redis.set('test:slots', JSON.stringify(payload));
    const raw = await redis.get('test:slots');
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed).toEqual(payload);
  });

  // ─────────────────────────────────────────────────────────
  // TTL
  // ─────────────────────────────────────────────────────────

  it('supports TTL (EX)', async () => {
    await redis.set('test:ttl', 'value', 'EX', 60);
    const ttl = await redis.ttl('test:ttl');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('returns -2 for a missing key TTL', async () => {
    const ttl = await redis.ttl('test:nonexistent');
    expect(ttl).toBe(-2);
  });

  // ─────────────────────────────────────────────────────────
  // Multiple keys
  // ─────────────────────────────────────────────────────────

  it('sets and gets multiple keys with MSET / MGET', async () => {
    await redis.mset('test:a', '1', 'test:b', '2', 'test:c', '3');
    const values = await redis.mget('test:a', 'test:b', 'test:c');
    expect(values).toEqual(['1', '2', '3']);
  });

  it('scans keys with a pattern', async () => {
    await redis.mset(
      'test:scan:1',
      'a',
      'test:scan:2',
      'b',
      'test:scan:3',
      'c',
    );

    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(
        cursor,
        'MATCH',
        'test:scan:*',
        'COUNT',
        100,
      );
      keys.push(...batch);
      cursor = next;
    } while (cursor !== '0');

    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys).toContain('test:scan:1');
    expect(keys).toContain('test:scan:2');
    expect(keys).toContain('test:scan:3');
  });

  // ─────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────

  it('removes all test keys after cleanup', async () => {
    const keys = await redis.keys('test:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    const after = await redis.keys('test:*');
    expect(after).toHaveLength(0);
  });
});
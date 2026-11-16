// Unit tests for the daily-game server rules (pure, Devvit-free).
// Run: node --test tests/server-rules.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDailyState,
  readLeaderboard,
  submitScore,
} from '../src/server/rules.ts';
import {
  previousUtcDate,
  seedFromDate,
  utcDateString,
} from '../src/shared/api.ts';

/** Minimal in-memory Redis implementing the RedisLike surface. */
function fakeRedis() {
  const kv = new Map();
  const hashes = new Map();
  const zsets = new Map();
  return {
    async get(key) {
      return kv.get(key);
    },
    async set(key, value) {
      kv.set(key, value);
      return 1;
    },
    async hGetAll(key) {
      return { ...(hashes.get(key) ?? {}) };
    },
    async hSet(key, values) {
      const hash = hashes.get(key) ?? {};
      Object.assign(hash, values);
      hashes.set(key, hash);
      return 1;
    },
    async hIncrBy(key, field, value) {
      const hash = hashes.get(key) ?? {};
      const next = (Number.parseInt(hash[field] ?? '0', 10) || 0) + value;
      hash[field] = String(next);
      hashes.set(key, hash);
      return next;
    },
    async zAdd(key, ...members) {
      const set = zsets.get(key) ?? new Map();
      for (const member of members) set.set(member.member, member.score);
      zsets.set(key, set);
      return 1;
    },
    async zScore(key, member) {
      return zsets.get(key)?.get(member);
    },
    async zRange(key, start, stop, options) {
      const set = zsets.get(key) ?? new Map();
      let rows = [...set.entries()].map(([member, score]) => ({ member, score }));
      rows.sort((a, b) => a.score - b.score);
      if (options?.reverse) rows.reverse();
      const end = stop === -1 ? rows.length : stop + 1;
      rows = rows.slice(start, end);
      if (options?.withScores) return rows;
      return rows.map((row) => row.member);
    },
  };
}

const DAY1 = new Date('2026-11-17T10:00:00Z');
const DAY2 = new Date('2026-11-18T10:00:00Z');
const DAY4 = new Date('2026-11-20T10:00:00Z');

describe('date and seed helpers', () => {
  it('formats UTC dates', () => {
    assert.equal(utcDateString(DAY1), '2026-11-17');
    assert.equal(utcDateString(new Date('2026-12-31T23:30:00Z')), '2026-12-31');
  });

  it('seeds are deterministic per day and differ across days', () => {
    assert.equal(seedFromDate('2026-11-17'), seedFromDate('2026-11-17'));
    assert.notEqual(seedFromDate('2026-11-17'), seedFromDate('2026-11-18'));
    assert.ok(Number.isInteger(seedFromDate('2026-11-17')));
  });

  it('previousUtcDate crosses month boundaries', () => {
    assert.equal(previousUtcDate('2026-12-01'), '2026-11-30');
    assert.equal(previousUtcDate('2026-11-17'), '2026-11-16');
    assert.equal(previousUtcDate('2027-01-01'), '2026-12-31');
  });
});

describe('daily state', () => {
  it('logged-out viewers get a read-only state', async () => {
    const redis = fakeRedis();
    const state = await getDailyState(redis, DAY1, undefined, undefined);
    assert.equal(state.date, '2026-11-17');
    assert.equal(state.seed, seedFromDate('2026-11-17'));
    assert.equal(state.attemptsLeft, 3);
    assert.equal(state.bestToday, 0);
    assert.equal(state.streak, 0);
    assert.equal(state.loggedIn, false);
  });

  it('a fresh player starts with 3 attempts', async () => {
    const redis = fakeRedis();
    const state = await getDailyState(redis, DAY1, 'u1', 'alice');
    assert.equal(state.attemptsLeft, 3);
    assert.equal(state.loggedIn, true);
  });
});

describe('score submission', () => {
  it('accepts the first run, records the best, ranks #1', async () => {
    const redis = fakeRedis();
    const result = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 1250, 12, 3);
    assert.equal(result.status, 'ok');
    assert.equal(result.accepted, true);
    assert.equal(result.bestToday, 1250);
    assert.equal(result.rank, 1);
    assert.equal(result.streak, 1);
    assert.equal(result.attemptsLeft, 2);
    assert.equal(result.leaderboard.length, 1);
    assert.equal(result.leaderboard[0].username, 'alice');
  });

  it('keeps the best across attempts and caps at 3 per day', async () => {
    const redis = fakeRedis();
    await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 1250, 12, 3);
    const second = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 800, 8, 2);
    assert.equal(second.accepted, true);
    assert.equal(second.bestToday, 1250);
    assert.equal(second.attemptsLeft, 1);
    const third = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 2400, 20, 4);
    assert.equal(third.accepted, true);
    assert.equal(third.bestToday, 2400);
    assert.equal(third.attemptsLeft, 0);
    const fourth = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 9999, 30, 5);
    assert.equal(fourth.accepted, false);
    assert.equal(fourth.bestToday, 2400);
    assert.equal(fourth.attemptsLeft, 0);
  });

  it('rejects absurd scores and stale dates', async () => {
    const redis = fakeRedis();
    const absurd = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 1000000, 1, 1);
    assert.equal(absurd.status, 'error');
    const stale = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-16', 500, 5, 1);
    assert.equal(stale.status, 'error');
    const anon = await submitScore(redis, DAY1, undefined, undefined, '2026-11-17', 500, 5, 1);
    assert.equal(anon.status, 'error');
  });

  it('orders the leaderboard best-first across players', async () => {
    const redis = fakeRedis();
    await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 900, 9, 2);
    await submitScore(redis, DAY1, 'u2', 'bob', '2026-11-17', 2100, 18, 4);
    await submitScore(redis, DAY1, 'u3', 'carol', '2026-11-17', 1500, 14, 3);
    const board = await readLeaderboard(redis, '2026-11-17', 'u1');
    assert.deepEqual(board.map((row) => row.username), ['bob', 'carol', 'alice']);
    assert.deepEqual(board.map((row) => row.rank), [1, 2, 3]);
    assert.equal(board[2].you, true);
  });

  it('streaks grow on consecutive days and reset after a skipped day', async () => {
    const redis = fakeRedis();
    const day1 = await submitScore(redis, DAY1, 'u1', 'alice', '2026-11-17', 500, 5, 1);
    assert.equal(day1.streak, 1);
    const day2 = await submitScore(redis, DAY2, 'u1', 'alice', '2026-11-18', 600, 6, 1);
    assert.equal(day2.streak, 2);
    const day4 = await submitScore(redis, DAY4, 'u1', 'alice', '2026-11-20', 700, 7, 1);
    assert.equal(day4.streak, 1);
  });
});

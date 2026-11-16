// Pure daily-game rules. No Devvit imports here: the Redis client is passed
// in, so the rules test against plain fakes with no runtime.
//
// Redis layout (installation-scoped, per the Devvit constraints):
//   lb:daily:<YYYY-MM-DD>   sorted set, member = user id, score = best today
//   lb:name:<userId>        string, username snapshot for the leaderboard
//   u:<userId>              hash: streak, lastPlayed (YYYY-MM-DD),
//                           attempts:<YYYY-MM-DD>, best:<YYYY-MM-DD>

import {
  DAILY_ATTEMPTS_PER_DAY,
  DAILY_DURATION_SECONDS,
  DAILY_MAX_SCORE,
  previousUtcDate,
  seedFromDate,
  utcDateString,
  type DailyState,
  type LeaderboardEntry,
  type ScoreSubmitResponse,
} from '../shared/api.ts';

export type RedisLike = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, values: Record<string, string>): Promise<unknown>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: { score: number; member: string }[]): Promise<unknown>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zRange(
    key: string,
    start: number | string,
    stop: number | string,
    options?: { by?: string; reverse?: boolean; withScores?: boolean },
  ): Promise<unknown>;
};

export function leaderboardKey(date: string): string {
  return `lb:daily:${date}`;
}

export function userKey(userId: string): string {
  return `u:${userId}`;
}

export function nameKey(userId: string): string {
  return `lb:name:${userId}`;
}

/** Build the daily state for a player. `now` is the server clock. */
export async function getDailyState(
  redis: RedisLike,
  now: Date,
  userId: string | undefined,
  username: string | undefined,
): Promise<DailyState> {
  const date = utcDateString(now);
  const seed = seedFromDate(date);
  const board = await readLeaderboard(redis, date, userId);
  if (!userId) {
    return {
      date,
      seed,
      durationSeconds: DAILY_DURATION_SECONDS,
      attemptsLeft: DAILY_ATTEMPTS_PER_DAY,
      bestToday: 0,
      streak: 0,
      leaderboard: board,
      loggedIn: false,
      standalone: false,
    };
  }
  const profile = await redis.hGetAll(userKey(userId));
  const attemptsUsed = Number.parseInt(profile[`attempts:${date}`] ?? '0', 10) || 0;
  const bestToday = Number.parseInt(profile[`best:${date}`] ?? '0', 10) || 0;
  const streak = Number.parseInt(profile.streak ?? '0', 10) || 0;
  return {
    date,
    seed,
    durationSeconds: DAILY_DURATION_SECONDS,
    attemptsLeft: Math.max(0, DAILY_ATTEMPTS_PER_DAY - attemptsUsed),
    bestToday,
    streak,
    leaderboard: board,
    loggedIn: true,
    standalone: false,
  };
}

/** Top 10 of the day's leaderboard, best first, with the viewer's rank flagged. */
export async function readLeaderboard(
  redis: RedisLike,
  date: string,
  viewerId: string | undefined,
): Promise<LeaderboardEntry[]> {
  const raw = (await redis.zRange(leaderboardKey(date), 0, 9, {
    by: 'rank',
    reverse: true,
    withScores: true,
  })) as { member: string; score: number }[];
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    const name = (await redis.get(nameKey(row.member))) ?? 'player';
    entries.push({ username: name, score: row.score, rank: i + 1, you: row.member === viewerId });
  }
  return entries;
}

/**
 * Record a completed daily run. Server-enforced: attempts are capped at
 * DAILY_ATTEMPTS_PER_DAY per day, the score must be plausible, and the
 * leaderboard only ever keeps a player's best score of the day. A repeat
 * submit after the attempts are spent returns the stored result instead of
 * rescoring.
 */
export async function submitScore(
  redis: RedisLike,
  now: Date,
  userId: string | undefined,
  username: string | undefined,
  date: string,
  score: number,
  kills: number,
  wave: number,
): Promise<ScoreSubmitResponse> {
  const today = utcDateString(now);
  if (!userId) {
    return { status: 'error', accepted: false, bestToday: 0, rank: 0, streak: 0, attemptsLeft: 0, leaderboard: [], message: 'Log in to Reddit to record a daily score.' };
  }
  if (date !== today) {
    return { status: 'error', accepted: false, bestToday: 0, rank: 0, streak: 0, attemptsLeft: 0, leaderboard: [], message: 'That day has already passed — play today instead.' };
  }
  if (!Number.isFinite(score) || score < 0 || score > DAILY_MAX_SCORE) {
    return { status: 'error', accepted: false, bestToday: 0, rank: 0, streak: 0, attemptsLeft: 0, leaderboard: [], message: 'Score rejected.' };
  }
  const key = userKey(userId);
  const profile = await redis.hGetAll(key);
  const attemptsUsed = Number.parseInt(profile[`attempts:${date}`] ?? '0', 10) || 0;
  if (attemptsUsed >= DAILY_ATTEMPTS_PER_DAY) {
    const bestToday = Number.parseInt(profile[`best:${date}`] ?? '0', 10) || 0;
    const streak = Number.parseInt(profile.streak ?? '0', 10) || 0;
    return {
      status: 'ok',
      accepted: false,
      bestToday,
      rank: await rankOf(redis, date, userId),
      streak,
      attemptsLeft: 0,
      leaderboard: await readLeaderboard(redis, date, userId),
      message: 'No attempts left today — come back tomorrow.',
    };
  }

  const previousBest = Number.parseInt(profile[`best:${date}`] ?? '0', 10) || 0;
  const bestToday = Math.max(previousBest, Math.floor(score));
  const lastPlayed = profile.lastPlayed ?? '';
  let streak = Number.parseInt(profile.streak ?? '0', 10) || 0;
  if (lastPlayed !== date) {
    streak = lastPlayed === previousUtcDate(date) ? streak + 1 : 1;
  }
  await redis.hSet(key, {
    [`attempts:${date}`]: String(attemptsUsed + 1),
    [`best:${date}`]: String(bestToday),
    lastPlayed: date,
    streak: String(streak),
  });
  await redis.set(nameKey(userId), username ?? 'player');
  const stored = await redis.zScore(leaderboardKey(date), userId);
  if (stored === undefined || bestToday > stored) {
    await redis.zAdd(leaderboardKey(date), { score: bestToday, member: userId });
  }
  void kills;
  void wave;
  return {
    status: 'ok',
    accepted: true,
    bestToday,
    rank: await rankOf(redis, date, userId),
    streak,
    attemptsLeft: DAILY_ATTEMPTS_PER_DAY - (attemptsUsed + 1),
    leaderboard: await readLeaderboard(redis, date, userId),
  };
}

/** 1-based rank of a player on the day's board, 0 when unranked. */
export async function rankOf(redis: RedisLike, date: string, userId: string): Promise<number> {
  const raw = (await redis.zRange(leaderboardKey(date), 0, -1, {
    by: 'rank',
    reverse: true,
  })) as string[];
  const index = raw.indexOf(userId);
  return index >= 0 ? index + 1 : 0;
}

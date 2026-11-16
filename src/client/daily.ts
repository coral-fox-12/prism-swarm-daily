// Local fallback for the standalone build (and for logged-out viewers):
// attempts, best score, streak and a personal leaderboard kept in
// localStorage. On Devvit the server owns all of this in Redis; this store
// only ever runs when /api/* is unreachable.

import { DAILY_ATTEMPTS_PER_DAY, previousUtcDate, utcDateString, type DailyState, type LeaderboardEntry } from '../shared/api.ts';
import { DAILY_STORE_KEY } from './game/config.js';

type DayRecord = { attemptsUsed: number; best: number };
type StreakRecord = { streak: number; lastPlayed: string };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off: the day's progress then lasts this visit only.
  }
}

/** Today's daily state from local storage only. */
export function loadLocalDaily(now: Date): DailyState {
  const date = utcDateString(now);
  const day = read<DayRecord>(`${DAILY_STORE_KEY}:${date}`, { attemptsUsed: 0, best: 0 });
  const streak = read<StreakRecord>(`${DAILY_STORE_KEY}:streak`, { streak: 0, lastPlayed: '' });
  return {
    date,
    seed: 0, // filled in by the caller from seedFromDate(date)
    durationSeconds: 120,
    attemptsLeft: Math.max(0, DAILY_ATTEMPTS_PER_DAY - day.attemptsUsed),
    bestToday: day.best,
    streak: streak.streak,
    leaderboard: loadLocalLeaderboard(date),
    loggedIn: false,
    standalone: true,
  };
}

function loadLocalLeaderboard(date: string): LeaderboardEntry[] {
  const rows = read<{ score: number }[]>(`${DAILY_STORE_KEY}:lb:${date}`, []);
  return rows
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((row, index) => ({ username: 'You', score: row.score, rank: index + 1, you: true }));
}

/** Record a completed local daily run; returns the updated state pieces. */
export function recordLocalRun(
  date: string,
  score: number,
): { bestToday: number; streak: number; attemptsLeft: number; rank: number; leaderboard: LeaderboardEntry[] } {
  const dayKey = `${DAILY_STORE_KEY}:${date}`;
  const day = read<DayRecord>(dayKey, { attemptsUsed: 0, best: 0 });
  const bestToday = Math.max(day.best, Math.floor(score));
  const attemptsUsed = day.attemptsUsed + 1;
  write(dayKey, { attemptsUsed, best: bestToday });

  const streakKey = `${DAILY_STORE_KEY}:streak`;
  const streakRecord = read<StreakRecord>(streakKey, { streak: 0, lastPlayed: '' });
  let streak = streakRecord.streak;
  if (streakRecord.lastPlayed !== date) {
    streak = streakRecord.lastPlayed === previousUtcDate(date) ? streak + 1 : 1;
    write(streakKey, { streak, lastPlayed: date });
  }

  const lbKey = `${DAILY_STORE_KEY}:lb:${date}`;
  const rows = read<{ score: number }[]>(lbKey, []);
  rows.push({ score: Math.floor(score) });
  write(lbKey, rows);
  const leaderboard = loadLocalLeaderboard(date);
  const rank = leaderboard.findIndex((row) => row.score === Math.floor(score)) + 1;
  return { bestToday, streak, attemptsLeft: Math.max(0, DAILY_ATTEMPTS_PER_DAY - attemptsUsed), rank, leaderboard };
}

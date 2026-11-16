// The typed contract between the Devvit client and server, plus the daily
// helpers both sides share. This module is deliberately Node-free and
// Devvit-free so the browser client can import it too.
//
// Daily identity: a day is a UTC calendar date (YYYY-MM-DD). The daily seed
// is a 32-bit FNV-1a hash of that date string, so every player on the same
// day gets the same spawn pattern and the daily leaderboard is a fair race.

export const DAILY_DURATION_SECONDS = 120;
export const DAILY_ATTEMPTS_PER_DAY = 3;
/** Rejects absurd scores at submit time; a great 120 s run is a few thousand. */
export const DAILY_MAX_SCORE = 100000;

export type LeaderboardEntry = {
  username: string;
  score: number;
  rank: number;
  you: boolean;
};

export type DailyState = {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  /** 32-bit seed for today's run. */
  seed: number;
  /** Seconds per daily run. */
  durationSeconds: number;
  /** Daily runs left for this player (server-enforced when logged in). */
  attemptsLeft: number;
  /** This player's best score today, 0 when they have not played. */
  bestToday: number;
  /** Consecutive days with at least one completed daily run. */
  streak: number;
  /** Top 10 scores today. */
  leaderboard: LeaderboardEntry[];
  /** False for logged-out viewers and for the standalone build. */
  loggedIn: boolean;
  /** True when the client is running outside Devvit (local test build). */
  standalone: boolean;
};

export type ScoreSubmitRequest = {
  date: string;
  score: number;
  kills: number;
  wave: number;
};

export type ScoreSubmitResponse = {
  status: 'ok' | 'error';
  accepted: boolean;
  /** This player's best score today after this submit. */
  bestToday: number;
  /** Rank on today's leaderboard (1-based), 0 when not ranked. */
  rank: number;
  streak: number;
  attemptsLeft: number;
  leaderboard: LeaderboardEntry[];
  message?: string;
};

export type ShareRequest = {
  score: number;
  rank: number;
};

export type ShareResponse = {
  status: 'ok' | 'error';
  commentUrl?: string;
  message?: string;
};

/** UTC calendar date for `when`, formatted YYYY-MM-DD. */
export function utcDateString(when: Date): string {
  const year = when.getUTCFullYear();
  const month = String(when.getUTCMonth() + 1).padStart(2, '0');
  const day = String(when.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 32-bit FNV-1a hash of a string — deterministic across client and server. */
export function seedFromDate(date: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < date.length; i += 1) {
    hash ^= date.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The UTC date of the calendar day before `date` (YYYY-MM-DD). */
export function previousUtcDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const when = new Date(Date.UTC(year, month - 1, day));
  when.setUTCDate(when.getUTCDate() - 1);
  return utcDateString(when);
}

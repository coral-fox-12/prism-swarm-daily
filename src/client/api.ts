// Client-side fetch wrapper for the Devvit server. Every call degrades
// gracefully: outside Devvit (or when the server is unreachable) the caller
// gets null and falls back to the local store, so the game always plays.

import type { DailyState, ScoreSubmitRequest, ScoreSubmitResponse, ShareRequest, ShareResponse } from '../shared/api.ts';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch(path, { ...init, signal: controller.signal });
    window.clearTimeout(timer);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchDaily(): Promise<DailyState | null> {
  const data = await fetchJson<{ status: string } & DailyState>('/api/daily');
  if (!data || data.status !== 'ok') return null;
  return data;
}

export async function postScore(request: ScoreSubmitRequest): Promise<ScoreSubmitResponse | null> {
  return fetchJson<ScoreSubmitResponse>('/api/score', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function postShare(request: ShareRequest): Promise<ShareResponse | null> {
  return fetchJson<ShareResponse>('/api/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
}

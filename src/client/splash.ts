// Inline feed card for PRISM SWARM: Daily.
//
// The card must paint instantly: it renders from embedded defaults first and
// fills in today's numbers lazily when /api/daily answers. It never blocks
// on the network — a feed card that waits gets scrolled past.
// PLAY opens the full game in expanded mode.

import { requestExpandedMode } from '@devvit/web/client';
import { fetchDaily } from './api.js';
import { utcDateString } from '../shared/api.ts';

const todayEl = document.getElementById('today');
const bestEl = document.getElementById('best');
const streakEl = document.getElementById('streak');
const playButton = document.getElementById('play');

if (todayEl) todayEl.textContent = utcDateString(new Date());

// Lazy fill: if the server never answers (logged-out viewer, slow network),
// the card keeps its defaults and PLAY still works.
void fetchDaily().then((daily) => {
  if (!daily) return;
  if (todayEl) todayEl.textContent = daily.date;
  if (bestEl) bestEl.textContent = daily.bestToday.toLocaleString('en-US');
  if (streakEl) streakEl.textContent = daily.streak > 0 ? String(daily.streak) : '—';
});

playButton?.addEventListener('click', (event) => {
  // Inside Reddit the webview hostname ends with .devvit.net: ask the host to
  // open the game entry expanded. Anywhere else (local test build), open the
  // game page directly — there is no host to expand into.
  if (window.location.hostname.endsWith('.devvit.net')) {
    requestExpandedMode(event, 'game');
  } else {
    window.location.href = './game.html';
  }
});

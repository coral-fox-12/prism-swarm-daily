// PRISM SWARM: Daily — Devvit Web server.
//
// Express app behind Devvit's createServer, listening on getServerPort()
// (the documented bootstrap: createServer(app) + server.listen(port)).
// Client traffic uses /api/*; Reddit callbacks use /internal/*.
//
// Every handler is defensive about missing context: logged-out viewers get a
// read-only daily state, and a missing permission surfaces the real error
// message in the response while developing (strip the detail before publish
// if it ever leaks internals — these endpoints only return safe strings).

import express from 'express';
import { context, createServer, getServerPort, reddit, redis } from '@devvit/web/server';
import { getDailyState, submitScore } from './rules.ts';
import { utcDateString, type ScoreSubmitRequest, type ShareRequest } from '../shared/api.ts';

const app = express();
app.use(express.json());

function fail(res: express.Response, status: number, message: string, detail?: unknown): void {
  const body: Record<string, unknown> = { status: 'error', message };
  if (detail !== undefined) body.detail = String(detail);
  res.status(status).json(body);
}

/** Today's daily state: seed, attempts, best, streak, leaderboard. */
app.get('/api/daily', async (_req, res) => {
  try {
    const state = await getDailyState(redis, new Date(), context.userId, context.username);
    res.json({ status: 'ok', ...state });
  } catch (error) {
    fail(res, 500, 'Could not load today’s game.', error instanceof Error ? error.message : error);
  }
});

/** Record a completed daily run. Attempts and score caps are enforced server-side. */
app.post('/api/score', async (req, res) => {
  try {
    const body = req.body as Partial<ScoreSubmitRequest>;
    const result = await submitScore(
      redis,
      new Date(),
      context.userId,
      context.username,
      typeof body.date === 'string' ? body.date : '',
      typeof body.score === 'number' ? body.score : -1,
      typeof body.kills === 'number' ? body.kills : 0,
      typeof body.wave === 'number' ? body.wave : 0,
    );
    res.json(result);
  } catch (error) {
    fail(res, 500, 'Could not record your score.', error instanceof Error ? error.message : error);
  }
});

/** Share a daily score as a comment on the post, from the player. */
app.post('/api/share', async (req, res) => {
  try {
    const body = req.body as Partial<ShareRequest>;
    if (!context.userId || !context.postId) {
      fail(res, 401, 'Log in to Reddit to share your score.');
      return;
    }
    const date = utcDateString(new Date());
    const score = typeof body.score === 'number' ? Math.floor(body.score) : 0;
    const rank = typeof body.rank === 'number' ? Math.floor(body.rank) : 0;
    const text =
      rank > 0
        ? `I scored ${score.toLocaleString('en-US')} in PRISM SWARM: Daily (${date}) — #${rank} on today's leaderboard! Match the colour, break the swarm.`
        : `I scored ${score.toLocaleString('en-US')} in PRISM SWARM: Daily (${date}). Match the colour, break the swarm.`;
    const comment = await reddit.submitComment({ id: context.postId, text, runAs: 'USER' });
    res.json({ status: 'ok', commentUrl: comment.permalink ? `https://www.reddit.com${comment.permalink}` : undefined });
  } catch (error) {
    fail(res, 500, 'Could not share your score.', error instanceof Error ? error.message : error);
  }
});

/** Moderator menu: create a fresh daily-game post in this subreddit. */
app.post('/internal/menu/create-post', async (_req, res) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName) {
      fail(res, 400, 'No subreddit in context.');
      return;
    }
    const date = utcDateString(new Date());
    const post = await reddit.submitCustomPost({
      subredditName,
      title: `PRISM SWARM: Daily — ${date} — match the colour, break the swarm`,
      postData: { date, game: 'prism-swarm-daily' },
      textFallback: { text: 'Play today’s PRISM SWARM daily run: 120 seconds, one seed for everyone, 3 attempts. Top score wins the day.' },
    });
    res.json({ status: 'ok', showToast: { text: 'Daily game post created.', appearance: 'success' }, postId: post.id });
  } catch (error) {
    fail(res, 500, 'Could not create the post.', error instanceof Error ? error.message : error);
  }
});

/** When the app is installed, seed the subreddit with the first daily post. */
app.post('/internal/triggers/app-install', async (_req, res) => {
  try {
    const subredditName = context.subredditName;
    if (!subredditName) {
      res.json({ status: 'ok' });
      return;
    }
    const date = utcDateString(new Date());
    await reddit.submitCustomPost({
      subredditName,
      title: `PRISM SWARM: Daily — ${date} — match the colour, break the swarm`,
      postData: { date, game: 'prism-swarm-daily' },
      textFallback: { text: 'Play today’s PRISM SWARM daily run: 120 seconds, one seed for everyone, 3 attempts. Top score wins the day.' },
    });
    res.json({ status: 'ok' });
  } catch (error) {
    // A failed seed post must not fail the install.
    console.error('app-install seed post failed:', error instanceof Error ? error.message : error);
    res.json({ status: 'ok' });
  }
});

const port = getServerPort();
const server = createServer(app);
server.listen(port, () => {
  console.log(`prism-swarm-daily server on http://localhost:${port}`);
});

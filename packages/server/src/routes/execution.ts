import { Hono } from 'hono';
import type { AppContext } from '../app.ts';

export const executionRoutes = new Hono<AppContext>();

executionRoutes.post('/execution/pause', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  await backend.pause();
  const registers = await backend.readRegisters();
  return c.json({ ok: true, registers });
});

executionRoutes.post('/execution/resume', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  await backend.resume();
  return c.json({ ok: true });
});

executionRoutes.post('/execution/step', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const registers = await backend.step();
  return c.json({ registers });
});

import { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import type { LaunchConfig } from '@dosprobe/core';

export const launchRoutes = new Hono<AppContext>();

launchRoutes.get('/launch/defaults', (c) => {
  const defaults = c.get('launchDefaults');
  if (!defaults) {
    return c.json({ error: 'Launch defaults not configured' }, 503);
  }
  return c.json(defaults);
});

launchRoutes.post('/launch', async (c) => {
  const backend = c.get('backend');
  if (!backend) {
    return c.json({ error: 'No backend configured' }, 400);
  }
  const config = await c.req.json<LaunchConfig>();
  await backend.launch(config);
  return c.json({ ok: true, pid: backend.status().pid });
});

launchRoutes.delete('/launch', async (c) => {
  const backend = c.get('backend');
  if (!backend) {
    return c.json({ error: 'No backend configured' }, 400);
  }
  await backend.shutdown();
  return c.json({ ok: true });
});

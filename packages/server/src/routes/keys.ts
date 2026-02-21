import { Hono } from 'hono';
import type { AppContext } from '../app.ts';

export const keysRoutes = new Hono<AppContext>();

keysRoutes.post('/keys', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const body = await c.req.json<{ keys: string[]; delay?: number }>();
  await backend.sendKeys(body.keys, body.delay);
  return c.json({ ok: true, injected: body.keys.length });
});

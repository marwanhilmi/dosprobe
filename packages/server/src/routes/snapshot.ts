import { Hono } from 'hono';
import type { AppContext } from '../app.ts';

export const snapshotRoutes = new Hono<AppContext>();

snapshotRoutes.get('/snapshots', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const snapshots = await backend.listSnapshots();
  return c.json({ snapshots });
});

snapshotRoutes.post('/snapshots', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const body = await c.req.json<{ action: 'save' | 'load'; name: string }>();

  if (body.action === 'save') {
    const snapshot = await backend.saveSnapshot(body.name);
    return c.json({ ok: true, snapshot });
  } else {
    await backend.loadSnapshot(body.name);
    return c.json({ ok: true });
  }
});

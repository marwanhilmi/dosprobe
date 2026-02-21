import { Hono } from 'hono';
import type { AppContext } from '../app.ts';

export const backendRoutes = new Hono<AppContext>();

backendRoutes.get('/backend', (c) => {
  const backend = c.get('backend');
  if (!backend) {
    return c.json({ type: null, status: 'disconnected' });
  }
  return c.json(backend.status());
});

backendRoutes.post('/backend/select', async (c) => {
  let body: { backend?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid or missing JSON body' }, 400);
  }
  if (body.backend !== 'qemu' && body.backend !== 'dosbox') {
    return c.json({ error: 'Invalid backend type, must be "qemu" or "dosbox"' }, 400);
  }

  const factory = c.get('backendFactory');
  if (!factory) {
    return c.json({ error: 'Backend switching not available' }, 503);
  }

  const holder = c.get('backendHolder');

  // Shut down current backend if any
  if (holder.backend) {
    try {
      await holder.backend.shutdown();
    } catch {
      // ignore shutdown errors
    }
    holder.setBackend(null);
  }

  try {
    const newBackend = await factory(body.backend);
    holder.setBackend(newBackend);
    return c.json({ ok: true, selected: body.backend });
  } catch (err) {
    return c.json({ error: `Failed to create ${body.backend} backend: ${err instanceof Error ? err.message : err}` }, 500);
  }
});

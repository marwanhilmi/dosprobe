import { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { parseAddress } from '@dosprobe/core';
import { sha256 } from '@dosprobe/shared';

export const memoryRoutes = new Hono<AppContext>();

memoryRoutes.get('/memory/:address/:size', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const address = parseAddress(c.req.param('address'));
  const size = parseInt(c.req.param('size'), 10);
  const format = c.req.query('format') ?? 'base64';

  const data = await backend.readMemory(address, size);

  if (format === 'raw') {
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  }

  return c.json({
    address: `0x${address.linear.toString(16)}`,
    size: data.length,
    data: data.toString('base64'),
    sha256: sha256(data),
  });
});

memoryRoutes.post('/memory/:address', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const address = parseAddress(c.req.param('address'));
  const body = await c.req.json<{ data: string }>();
  const data = Buffer.from(body.data, 'base64');

  await backend.writeMemory(address, data);
  return c.json({ ok: true, bytesWritten: data.length });
});

import { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { parseAddress } from '@dosprobe/core';
import type { BreakpointType } from '@dosprobe/core';

export const breakpointsRoutes = new Hono<AppContext>();

breakpointsRoutes.get('/breakpoints', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const breakpoints = await backend.listBreakpoints();
  return c.json({ breakpoints });
});

breakpointsRoutes.post('/breakpoints', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const body = await c.req.json<{
    type: BreakpointType;
    address?: string;
    interrupt?: number;
    ah?: number;
  }>();

  const address = body.address ? parseAddress(body.address) : parseAddress('0x0');
  const bp = await backend.setBreakpoint(body.type, address);
  return c.json(bp);
});

breakpointsRoutes.delete('/breakpoints/:id', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  await backend.removeBreakpoint(c.req.param('id'));
  return c.json({ ok: true });
});

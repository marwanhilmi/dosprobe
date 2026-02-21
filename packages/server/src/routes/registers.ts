import { Hono } from 'hono';
import type { AppContext } from '../app.ts';

export const registersRoutes = new Hono<AppContext>();

registersRoutes.get('/registers', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const regs = await backend.readRegisters();
  return c.json(regs);
});

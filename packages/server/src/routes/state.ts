import { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { DosboxBackend } from '@dosprobe/core';

export const stateRoutes = new Hono<AppContext>();

stateRoutes.get('/states', async (c) => {
  const backend = c.get('backend');
  if (!backend || backend.type !== 'dosbox') {
    return c.json({ states: [] });
  }

  const dosboxBackend = backend as DosboxBackend;
  const states = dosboxBackend.getStateManager().listStates();
  return c.json({ states });
});

import { Hono } from 'hono';
import type { AppContext } from '../app.ts';

export const screenshotRoutes = new Hono<AppContext>();

screenshotRoutes.get('/screenshot', async (c) => {
  const backend = c.get('backend');
  if (!backend) return c.json({ error: 'No backend running' }, 503);

  const { data, format } = await backend.screenshot();

  const mimeTypes: Record<string, string> = {
    ppm: 'image/x-portable-pixmap',
    bmp: 'image/bmp',
    png: 'image/png',
  };

  return new Response(new Uint8Array(data), {
    headers: { 'Content-Type': mimeTypes[format] ?? 'application/octet-stream' },
  });
});

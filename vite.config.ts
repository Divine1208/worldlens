import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { handleAI, handleProxy, handleSearch, type Reply } from './server/handlers';

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
  });
}

/** Mounts /api/proxy, /api/ai, /api/search on both `vite` (dev) and `vite preview` (self-host). */
function worldlensApi(): Plugin {
  const mw: Connect.NextHandleFunction = async (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next();
    const url = new URL(req.url, 'http://localhost');
    const ip = req.socket.remoteAddress ?? 'local';
    let r: Reply;
    if (url.pathname === '/api/proxy') r = await handleProxy(url.searchParams.get('url'), ip);
    else if (url.pathname === '/api/ai' && req.method === 'POST') r = await handleAI(await readBody(req), ip);
    else if (url.pathname === '/api/search') r = await handleSearch(url.searchParams.get('q'), url.searchParams.get('news') !== '0');
    else if (url.pathname === '/api/health') r = { status: 200, type: 'application/json', body: JSON.stringify({ ok: true, server: true }) };
    else return next();
    res.statusCode = r.status;
    res.setHeader('Content-Type', r.type);
    res.end(r.body);
  };
  return {
    name: 'worldlens-api',
    configureServer(s) { s.middlewares.use(mw); },
    configurePreviewServer(s) { s.middlewares.use(mw); },
  };
}

export default defineConfig({
  // relative base so the same build works at a domain root (Vercel) or a sub-path (GitHub Pages)
  base: './',
  plugins: [react(), worldlensApi()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
} as never);

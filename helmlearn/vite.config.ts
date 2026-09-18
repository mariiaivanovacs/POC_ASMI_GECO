import { defineConfig, type Connect, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5_000_000;

const fetchUrlHandler: Connect.NextHandleFunction = (req, res) => {
  void (async () => {
    const full = new URL(req.url || '', 'http://internal');
    const target = full.searchParams.get('url') || '';
    const send = (status: number, payload: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(payload));
    };
    if (!/^https?:\/\//i.test(target)) return send(400, { error: 'Provide a valid http(s) URL.' });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const r = await fetch(target, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'HelmLearnPOC/1.0 (+local dev)' } });
      if (!r.ok) throw new Error('The page responded with ' + r.status + '.');
      const ct = r.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml|text\/plain/i.test(ct)) throw new Error('That URL did not return a readable web page (got ' + (ct || 'an unknown type') + ').');
      const buf = await r.arrayBuffer();
      if (buf.byteLength > MAX_BYTES) throw new Error('That page is too large to read (over 5MB).');
      send(200, { html: Buffer.from(buf).toString('utf-8'), finalUrl: r.url });
    } catch (e) {
      const msg = e instanceof Error
        ? e.name === 'AbortError' ? 'The page took too long to respond.'
          : e.message === 'fetch failed' ? 'Could not reach that domain — check the URL and your connection.'
          : e.message
        : 'Could not fetch that page.';
      send(502, { error: msg });
    } finally {
      clearTimeout(timer);
    }
  })();
};

function fetchUrlProxy(): Plugin {
  return {
    name: 'fetch-url-proxy',
    configureServer(server) { server.middlewares.use('/api/fetch-url', fetchUrlHandler); },
    configurePreviewServer(server) { server.middlewares.use('/api/fetch-url', fetchUrlHandler); },
  };
}

// BASE_PATH=/document-assembly/ (or /genai-learning/) builds the app for a sub-path behind nginx — see deploy/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), fetchUrlProxy()],
  server: {
    port: 5173, strictPort: true,
    proxy: { '/api/deepseek': { target: 'https://api.deepseek.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/deepseek/, '') } },
  },
  preview: {
    proxy: { '/api/deepseek': { target: 'https://api.deepseek.com', changeOrigin: true, rewrite: (p) => p.replace(/^\/api\/deepseek/, '') } },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
});

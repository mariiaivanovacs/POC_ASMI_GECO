import { defineConfig, type Connect, type Plugin } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Qwen (Alibaba DashScope, OpenAI-compatible) relay. The key lives only in ../.env.local (DASHSCOPE_API_KEY) and is
// injected here, server-side, so it never reaches the browser bundle. Only chat/completions (+ /health) is exposed,
// with a size cap and a server-chosen model.
const QWEN_BASE = () => process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const QWEN_MODEL = () => process.env.QWEN_MODEL || 'qwen-plus';
const MAX_BODY = 200_000;
// Daily spend guard: the relay refuses after QWEN_DAILY_CAP calls per UTC day (default 400), whatever the caller.
const DAILY_CAP = Number(process.env.QWEN_DAILY_CAP || 400);
let capDay = '', capCount = 0;
const qwenHandler: Connect.NextHandleFunction = (req, res) => {
  void (async () => {
    const send = (status: number, payload: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(payload)); };
    const key = process.env.DASHSCOPE_API_KEY;
    if (req.method === 'GET' && /^\/health\/?$/.test(req.url || '')) return send(key ? 200 : 503, { ok: !!key, model: QWEN_MODEL() });
    if (!key) return send(503, { error: { message: 'Qwen relay has no DASHSCOPE_API_KEY configured on the server.' } });
    if (req.method !== 'POST' || !/^\/chat\/completions\/?$/.test(req.url || '')) return send(404, { error: { message: 'Not found' } });
    const today = new Date().toISOString().slice(0, 10);
    if (capDay !== today) { capDay = today; capCount = 0; }
    if (++capCount > DAILY_CAP) return send(429, { error: { message: 'Daily Qwen call limit reached for this demo server.' } });
    const chunks: Buffer[] = []; let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > MAX_BODY) return send(413, { error: { message: 'Request too large' } }); chunks.push(c as Buffer); }
    let body: Record<string, unknown>;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { return send(400, { error: { message: 'Invalid JSON' } }); }
    body.model = QWEN_MODEL(); delete body.stream;
    try {
      const r = await fetch(QWEN_BASE() + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
      res.statusCode = r.status; res.setHeader('content-type', 'application/json'); res.end(await r.text());
    } catch (e) { send(502, { error: { message: e instanceof Error ? e.message : 'Upstream failed' } }); }
  })();
};

function qwenRelay(): Plugin {
  return {
    name: 'qwen-relay',
    configureServer(server) { server.middlewares.use('/api/qwen', qwenHandler); },
    configurePreviewServer(server) { server.middlewares.use('/api/qwen', qwenHandler); },
  };
}

// BASE_PATH=/document-assembly/ (or /genai-learning/) builds the app for a sub-path behind nginx — see deploy/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  for (const k of ['DASHSCOPE_API_KEY', 'DASHSCOPE_BASE_URL', 'QWEN_MODEL']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  return {
    base: process.env.BASE_PATH || '/',
    plugins: [react(), qwenRelay()],
    server: { port: 5174, strictPort: true },
    // the VPS serves these behind Caddy on *.sslip.io names; vite preview rejects unknown Host headers by default
    preview: { allowedHosts: ['.sslip.io', 'localhost', '127.0.0.1'] },
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.test.ts'],
    },
  };
});

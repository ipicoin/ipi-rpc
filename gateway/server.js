'use strict';

/**
 * IPI Web Gateway RPC — minimalny reverse-proxy do node IPI.
 *
 * Wystawia:
 *   GET  /health           -> healthcheck gatewaya (JSON)
 *   ANY  /rpc/*            -> proxy do Tendermint RPC   (IPI_RPC_UPSTREAM)
 *   ANY  /api/*            -> proxy do Cosmos REST/LCD  (IPI_REST_UPSTREAM)
 *
 * SSOT endpointów (chainconfig / Fala 0) przez ENV, z domyslnymi wartosciami IPI.
 * Zobacz docs/GATEWAY.md.
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

// --- Konfiguracja (SSOT: chainconfig / Fala 0, nadpisywalna przez ENV) ---
const PORT = parseInt(process.env.PORT || '8080', 10);
const RPC_UPSTREAM = process.env.IPI_RPC_UPSTREAM || 'https://ipicoin.eu/rpc';
const REST_UPSTREAM = process.env.IPI_REST_UPSTREAM || 'https://ipicoin.eu/api';

// CORS: domyslnie '*' (publiczny gateway); ogranicz przez CORS_ORIGIN.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Rate-limit (stub): prosty licznik in-memory per IP w oknie czasowym.
// Produkcyjnie zastapic np. redisem / express-rate-limit lub warstwa edge.
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

// --- CORS ---
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.headers['access-control-request-headers'] || 'Content-Type,Authorization'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

// --- Rate-limit (stub, in-memory) ---
const hits = new Map(); // ip -> { count, resetAt }
app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  let rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    hits.set(ip, rec);
  }
  rec.count += 1;
  const remaining = Math.max(0, RATE_LIMIT_MAX - rec.count);
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (rec.count > RATE_LIMIT_MAX) {
    res.setHeader('Retry-After', String(Math.ceil((rec.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'rate_limited', retryAfterMs: rec.resetAt - now });
  }
  return next();
});

// --- Healthcheck ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ipi-gateway',
    time: new Date().toISOString(),
    upstreams: { rpc: RPC_UPSTREAM, rest: REST_UPSTREAM },
  });
});

// --- Proxy: /rpc -> Tendermint RPC ---
app.use(
  '/rpc',
  createProxyMiddleware({
    target: RPC_UPSTREAM,
    changeOrigin: true,
    pathRewrite: { '^/rpc': '' },
    xfwd: true,
    proxyTimeout: 30000,
    onError: (err, req, res) => {
      res.status(502).json({ error: 'bad_gateway', target: 'rpc', detail: err.message });
    },
  })
);

// --- Proxy: /api -> Cosmos REST/LCD ---
app.use(
  '/api',
  createProxyMiddleware({
    target: REST_UPSTREAM,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    xfwd: true,
    proxyTimeout: 30000,
    onError: (err, req, res) => {
      res.status(502).json({ error: 'bad_gateway', target: 'rest', detail: err.message });
    },
  })
);

// --- Root + 404 ---
app.get('/', (req, res) => {
  res.json({
    service: 'ipi-gateway',
    routes: ['/health', '/rpc/*', '/api/*'],
    docs: 'docs/GATEWAY.md',
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// Nie startuj serwera przy imporcie (ulatwia testy); tylko gdy plik uruchamiany wprost.
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`ipi-gateway listening on :${PORT} -> rpc=${RPC_UPSTREAM} rest=${REST_UPSTREAM}`);
  });
}

module.exports = app;

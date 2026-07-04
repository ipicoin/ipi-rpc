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

// trust proxy: liczba realnych proxy PRZED gatewayem (hop-count), NIE 'true'.
//   'true' = slepe zaufanie => klient moze podstawic dowolny X-Forwarded-For,
//   przez co spoofuje req.ip (obejscie rate-limitu + zapychanie mapy 'hits' = memory-DoS).
//   Ustaw TRUST_PROXY na liczbe hopow (np. 1 dla pojedynczego LB/reverse-proxy),
//   albo na liste CIDR proxy (np. '10.0.0.0/8,127.0.0.1'). Dla braku proxy -> 0.
//   Wartosc ZALEZY od Twojej topologii (ile proxy stoi przed gatewayem).
const TRUST_PROXY_RAW = process.env.TRUST_PROXY || '1';
// Jesli TRUST_PROXY to czysta liczba -> hop-count; w innym wypadku traktuj jako
// liste CIDR/adresow (Express akceptuje string rozdzielony przecinkami).
const TRUST_PROXY = /^\d+$/.test(TRUST_PROXY_RAW.trim())
  ? parseInt(TRUST_PROXY_RAW, 10)
  : TRUST_PROXY_RAW;

const app = express();
app.disable('x-powered-by');
// NIE 'true' (spoofowalny X-Forwarded-For). Domyslnie 1 hop; dostosuj przez TRUST_PROXY.
app.set('trust proxy', TRUST_PROXY);

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
// TODO(prod): to jest tylko STUB. Do produkcji uzyj `express-rate-limit`
//   (opcjonalnie z backendem redis/`rate-limit-redis`) albo warstwy edge (WAF/LB).
//   Stub trzyma stan w pamieci jednego procesu (nie dziala poprawnie multi-instance)
//   i nie ma twardej ochrony przed rozproszonym atakiem. Patrz gateway/README.md.
const hits = new Map(); // ip -> { count, resetAt }

// Sweep wygaslych wpisow: bez tego mapa 'hits' rosnie nieograniczenie przy duzej
// liczbie unikalnych IP (memory-DoS). Okresowo usuwamy przeterminowane rekordy.
// unref() -> ten timer nie blokuje zamkniecia procesu (istotne dla testow/CI).
const RATE_LIMIT_SWEEP_MS = parseInt(
  process.env.RATE_LIMIT_SWEEP_MS || String(RATE_LIMIT_WINDOW_MS),
  10
);
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of hits) {
    if (now > rec.resetAt) hits.delete(ip);
  }
}, RATE_LIMIT_SWEEP_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

app.use((req, res, next) => {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  let rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    // Czyszczenie przy dostepie (dodatkowo do okresowego sweepu): odswiez/utworz
    // rekord dla biezacego IP zamiast trzymac przeterminowany wpis.
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

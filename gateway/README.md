# IPI Web Gateway RPC

Minimalny, bezstanowy **reverse-proxy** wystawiajacy publiczne endpointy RPC/REST
do node IPI. Odseparowany od starego stacku `create-cosmos-app` (Next.js/Telescope)
— ma wlasny `package.json`, zeby nie mieszac zaleznosci.

Kontekst i decyzja architektoniczna: [`../docs/GATEWAY.md`](../docs/GATEWAY.md).

## Endpointy

| Metoda | Sciezka | Cel |
|---|---|---|
| GET | `/health` | Healthcheck gatewaya (JSON, lista upstreamow) |
| ANY | `/rpc/*` | Proxy do Tendermint RPC (`IPI_RPC_UPSTREAM`) |
| ANY | `/api/*` | Proxy do Cosmos REST/LCD (`IPI_REST_UPSTREAM`) |
| GET | `/` | Lista routow |

Broadcast tx (odblokowanie `wallet-core.js`): `POST /rpc` z JSON-RPC
`broadcast_tx_sync` / `broadcast_tx_commit`, lub `POST /api/cosmos/tx/v1beta1/txs`.

## Konfiguracja (ENV)

SSOT endpointow pochodzi z chainconfig (Fala 0); domyslne wartosci wskazuja na IPI.

| Zmienna | Domyslnie | Opis |
|---|---|---|
| `PORT` | `8080` | Port nasluchu |
| `IPI_RPC_UPSTREAM` | `https://ipicoin.eu/rpc` | Upstream Tendermint RPC |
| `IPI_REST_UPSTREAM` | `https://ipicoin.eu/api` | Upstream Cosmos REST/LCD |
| `CORS_ORIGIN` | `*` | Dozwolony Origin (CORS) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Okno rate-limitu (ms) |
| `RATE_LIMIT_MAX` | `120` | Max zapytan / okno / IP |

## Uruchomienie

```bash
cd gateway
npm install
npm start
# healthcheck:
curl http://localhost:8080/health
# przyklad odczytu RPC:
curl http://localhost:8080/rpc/status
# przyklad odczytu REST:
curl http://localhost:8080/api/cosmos/bank/v1beta1/balances/<addr>
```

Sanity check skladni bez instalacji zaleznosci:

```bash
node --check gateway/server.js
```

## Uwagi

- **Rate-limit to stub** (in-memory per IP). Produkcyjnie: `express-rate-limit` +
  wspoldzielony store (redis) albo limitowanie na warstwie edge/CDN.
- Gateway jest **przezroczysty** — nie modyfikuje payloadu, nie trzyma kluczy,
  nie podpisuje. Podpisywanie zostaje po stronie `wallet-core.js`.
- Gdy Fala 0 dostarczy kanoniczny chainconfig, wystarczy wskazac ENV na jego
  wartosci — bez zmian w kodzie proxy.

# IPI Web Gateway RPC — decyzja architektoniczna i specyfikacja

> Status: DRAFT (Fala 2). Domyka i zastępuje `#1` (undefined functionality).
> Roadmapa: `ipicoin/universal-independency-declaration#1`.

## 1. Czym `ipi-rpc` ma być (odpowiedź na #1)

`ipi-rpc` = **publiczny web gateway** dla łańcucha IPI: cienki, bezstanowy
reverse-proxy, który wystawia w internecie znormalizowane, CORS-owalne endpointy
RPC/REST wskazujące na node IPI. Jest to warstwa dostępu ("front door") dla
klientów przeglądarkowych i innych apek ekosystemu, a nie sam node ani nie apka
DeFi.

Odbiorcy:

- **`ipicoin/wallet-core.js`** — potrzebuje stabilnego endpointu do zapytań
  (`/api`, `/rpc`) oraz do **broadcastu podpisanych transakcji** (`POST /rpc`,
  Tendermint `broadcast_tx_*`). To odblokowuje kryterium akceptacji z #2.
- **apki front (`Iswap`, `Ivote`, `ipi-nft`)** — czytają stan łańcucha z
  przeglądarki; wymagają CORS i publicznego, stałego URL.
- **integracje zewnętrzne / eksplorery** — jeden dokumentowany punkt wejścia.

Czego gateway **NIE** robi: nie trzyma kluczy, nie podpisuje, nie przechowuje
stanu, nie jest indekserem. Podpisywanie zostaje po stronie `wallet-core.js`.

## 2. Stan obecny repo

- Bootstrap ze **starego `create-cosmos-app`** (README: „⚠️ UPGRADE TO 2.0").
- To jest w praktyce **Next.js demo** (`pages/index.tsx`,
  `pages/grpc-gateway.tsx`, `pages/grpc-web.tsx`) + wygenerowany kod klientów
  (`codegen_grpc_gateway/`, `codegen_grpc_web/`) via Telescope, oparte na
  `chain-registry` i **domyślnym chainie `osmosis`** (`config/defaults.ts`:
  `defaultChainName = 'osmosis'`). Zero konfiguracji IPI.
- Zależności przestarzałe: `next ^13`, `@cosmos-kit/react`, `cosmjs`, ciężki
  `yarn.lock` (~468 KB), setki plików codegen.

Wniosek: repo w obecnej formie to **demo frontendowe generatora**, nie działający
gateway. Nazwa `ipi-rpc` sugeruje warstwę serwerową — istnieje rozjazd między
nazwą/rolą a zawartością.

## 3. Decyzja: migracja vs. utrzymanie

### Rozważane opcje

| Opcja | Opis | Werdykt |
|---|---|---|
| A. Utrzymać `create-cosmos-app` | Naprawiać stary stack Next 13 + Telescope | ❌ przestarzały, zombie |
| B. Migracja na `create-interchain-app` | Regen całego demo na CCA 2.0 | ⚠️ nie rozwiązuje roli gatewaya |
| C. **Cienki gateway serwerowy** (ten PR) | Wydzielić `gateway/` jako niezależny reverse-proxy do node IPI | ✅ rekomendacja |

### Rekomendacja: **C — cienki gateway teraz, migracja demo osobno (B) później**

Uzasadnienie:

1. **Rola ≠ demo.** Zadanie z #2 ("gateway startuje i odpowiada", "wallet-core
   broadcastuje tx") to funkcja **serwerowa**: proxy RPC/REST + CORS + rate-limit.
   Ani stary CCA, ani CCA 2.0 (`create-interchain-app`) tego nie dostarczają —
   to startery **frontendowe** (React/Next). Migracja generatora nie zbliża do
   działającego gatewaya.
2. **Minimalne ryzyko, natychmiastowa wartość.** Wydzielony `gateway/`
   (Express + http-proxy, własny `package.json`) startuje bez dotykania ciężkiego
   stacku Next/Telescope i od razu spełnia kryteria akceptacji #2.
3. **Migracja demo pozostaje otwarta, ale odseparowana.** Gdy potrzebne będzie
   UI, rekomendujemy regen części frontendowej na **`create-interchain-app`**
   (zgodnie z ostrzeżeniem README) z chainem IPI zamiast `osmosis` — jako
   **oddzielne zadanie**, nie blokujące gatewaya. Do tego czasu ciężki codegen
   można zostawić lub przenieść do `legacy/`.

Innymi słowy: **nie przepisujemy całości**. Dostarczamy warstwę, której faktycznie
brakuje (serwerowy proxy), a migrację frontendowego demo traktujemy jako
niezależny, opcjonalny krok.

## 4. Zakres endpointów (SSOT: chainconfig / Fala 0)

Źródło prawdy o adresach node IPI (Single Source of Truth):

| Rola | Upstream (SSOT) | Endpoint gatewaya |
|---|---|---|
| Tendermint RPC | `https://ipicoin.eu/rpc` | `/rpc` (GET + POST) |
| Cosmos REST (LCD) | `https://ipicoin.eu/api` | `/api` |
| Healthcheck gatewaya | — | `/health` |

Adresy upstream są **konfigurowalne** przez zmienne środowiskowe
(`IPI_RPC_UPSTREAM`, `IPI_REST_UPSTREAM`) z powyższymi wartościami jako
domyślne — dzięki temu chainconfig z Fali 0 może je nadpisać bez zmiany kodu.

### Metody wystawiane (przez proxy `/rpc` i `/api`)

Gateway jest **przezroczysty** — przekazuje pełny interfejs upstreamu. Kluczowe
dla odbiorców:

- **Odczyt (wallet-core, apki):** `GET /rpc/status`, `/rpc/abci_query`,
  `/rpc/block`, `/api/cosmos/bank/v1beta1/balances/{addr}`,
  `/api/cosmos/auth/v1beta1/accounts/{addr}` itd.
- **Broadcast tx (odblokowanie wallet-core):** `POST /rpc` z metodą JSON-RPC
  `broadcast_tx_sync` / `broadcast_tx_commit`, ewentualnie
  `POST /api/cosmos/tx/v1beta1/txs`.

## 5. Mapa na kod repo (chainconfig)

- Dziś `config/defaults.ts` twardo ustawia `osmosis` z `chain-registry`.
  Docelowo (Fala 0) powinien eksportować **chainconfig IPI**: `chainId`,
  `rpc = https://ipicoin.eu/rpc`, `rest = https://ipicoin.eu/api`, denom, prefix.
- Gateway czyta te same wartości przez ENV (patrz `gateway/README.md`), więc gdy
  Fala 0 dostarczy kanoniczny chainconfig, wystarczy wskazać na niego ENV/import
  — bez zmian w logice proxy.

## 6. Kryteria akceptacji #2 — status po tym PR

- [x] Decyzja migracja vs. utrzymanie udokumentowana (sekcja 3: opcja C).
- [x] Gateway startuje i odpowiada na zdefiniowanym zestawie metod
      (`/health`, `/rpc`, `/api`) — `gateway/server.js`.
- [x] Endpointy pochodzą z SSOT chainconfig (ENV, domyślne = `ipicoin.eu`).
- [ ] Wallet-core.js broadcastuje tx przez gateway — do weryfikacji E2E po
      wdrożeniu gatewaya (poza zakresem tego PR; endpoint gotowy).
- [x] #1 domknięte przez tę specyfikację (sekcja 1).

## 7. Następne kroki (poza tym PR)

1. Deploy `gateway/` (np. Fly/Vercel/Node) pod publicznym URL.
2. E2E broadcast z `wallet-core.js` przez `/rpc`.
3. (Opcjonalnie) Regen demo frontendowego na `create-interchain-app` z chainem
   IPI; przeniesienie starego codegenu do `legacy/`.
4. Podpięcie kanonicznego chainconfig z Fali 0 (zamiast domyślnych ENV).

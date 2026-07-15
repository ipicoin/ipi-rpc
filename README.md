# IPI RPC Research Client

An experimental web client for comparing Cosmos gRPC-Web and gRPC-Gateway
code-generation and query paths.

> **Status: inherited prototype.** This repository is not an IPI RPC service,
> canonical SDK, or production wallet. Generated clients and configured
> endpoints must be verified against the target protocol version.

## Development

The codebase uses an older Create Cosmos App / Next.js stack. Review and update
its dependencies before exposing a deployment.

```sh
yarn
yarn dev
yarn build
```

Generate both client variants with:

```sh
yarn codegen
```

The local application is served at `http://localhost:3000`; comparison pages
are available under `/grpc-web` and `/grpc-gateway`.

## Verification priorities

Contributions should pin protocol definitions, make the source revision of
generated code reproducible, test equivalent responses across transports,
display endpoint and chain identity, and handle untrusted RPC responses without
misrepresenting them as verified state.

## Provenance and license

This repository derives from Hyperweb Create Cosmos App's
`grpc-web-grpc-gateway` example. See [UPSTREAM.md](UPSTREAM.md) for provenance
and migration context. Upstream and IPI modifications are distributed under
the [MIT License](LICENSE).

# Cosmos RPC Transport Research for IPI

Generated-client and browser comparison workspace for Cosmos gRPC-Web and
gRPC-Gateway query paths.

## What the source contains

- a Cosmos, IBC, and CosmWasm protobuf tree under `proto/`;
- separate generated TypeScript clients under `codegen_grpc_web/` and
  `codegen_grpc_gateway/`;
- generator scripts for both transports; and
- Next.js comparison pages at `/grpc-web` and `/grpc-gateway`.

The repository evaluates how equivalent Cosmos queries can be represented and
called through two web-facing transports. It is not an RPC server, canonical IPI
SDK, independently verifying light client, or configured IPI network client.

## Development

This codebase derives from an older Create Cosmos App / Next.js example. Review
its dependency and protocol versions before exposing a deployment.

```sh
yarn
yarn dev
yarn build
```

Regenerate both client trees with:

```sh
yarn codegen
```

## Integration requirements

An IPI-integrated version needs pinned protobuf source revisions, reproducible
generated output, configured and displayed chain/endpoint identity, equivalent
response fixtures across transports, untrusted-response handling, and tests
against a versioned public node interface.

## Development status

**Integration research.** The client-generation surface is substantial but
inherited from Hyperweb's `grpc-web-grpc-gateway` example, and no IPI-specific
endpoint or schema delta is implemented. Generated clients are transport code,
not proof that returned state is canonical or independently verified.

## Provenance and license

This repository derives from Hyperweb Create Cosmos App's
`grpc-web-grpc-gateway` example. See [UPSTREAM.md](UPSTREAM.md) for provenance
and migration context. Upstream and IPI modifications are distributed under the
[MIT License](LICENSE).

# rustly-tech/toolchain

Browser-side Rust execution primitives and versioned toolchain asset contracts
for [Rustly](https://rustly.tech).

This repository provides a small WASI preview 1 runtime that executes
precompiled `wasm32-wasip1` Rust programs with stdin, stdout, stderr, arguments,
and explicit resource limits. It also owns browser capability detection and the
content-addressed bundle manifest consumed by the web application.

## Status

| Capability                                 | Status                                                 |
| ------------------------------------------ | ------------------------------------------------------ |
| Execute precompiled Rust/WASI              | **IMPLEMENTED** and tested against real `rustc` output |
| Capability detection and degradation tiers | **IMPLEMENTED**                                        |
| Versioned BLAKE3 asset manifest            | **IMPLEMENTED**                                        |
| Cross-browser runtime qualification        | **EXPERIMENTAL**                                       |
| Compile Rust in-browser                    | **PLANNED**                                            |
| Browser rust-analyzer                      | **PLANNED**                                            |

Rust compilation currently remains remote. See
[the qualification contract](docs/QUALIFICATION.md) for the evidence required
before that changes.

## Develop

```sh
pnpm install --frozen-lockfile
pnpm run fixtures
pnpm run typecheck
pnpm run lint
pnpm run format
pnpm run test
pnpm run build
```

The checked-in WebAssembly fixtures are genuine Rust programs. CI rebuilds them
with pinned Rust 1.98.0 and fails if the result changes.

## License

MIT or Apache-2.0, at your option.

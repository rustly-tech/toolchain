# Rustly toolchain

Rust toolchain support for the Rustly website.

This package runs precompiled `wasm32-wasip1` Rust examples in the browser,
reports runtime capabilities, and verifies versioned toolchain manifests. It
does not contain an in-browser Rust compiler.

## Develop

```sh
corepack enable
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

The test fixtures require a local Rust toolchain with the `wasm32-wasip1`
target. Run `pnpm fixtures` to rebuild them.

See [browser toolchain qualification](docs/QUALIFICATION.md) for supported
behavior, limitations, and the work required before browser compilation can be
claimed.

## License

MIT or Apache-2.0, at your option.

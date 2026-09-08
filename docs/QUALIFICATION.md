# Browser toolchain qualification

Rustly separates execution from compilation because they have different proof
burdens.

## Current status

| Capability                                               | Status           | Evidence                                                                                                                                |
| -------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Execute `wasm32-wasip1` output                           | **IMPLEMENTED**  | Real Rust fixtures exercise stdin, argv, stdout, stderr, exit codes, output bounds, initial-memory bounds, and filesystem denial in CI. |
| Browser integration across Chromium, Firefox, and WebKit | **EXPERIMENTAL** | The runtime uses standard WebAssembly and Web APIs, but the initial CI suite runs in Node's WebAssembly host.                           |
| Compile Rust in the browser                              | **PLANNED**      | No compiler bundle is shipped and no UI claims local compilation.                                                                       |
| rust-analyzer in the browser                             | **PLANNED**      | No analyzer bundle is shipped.                                                                                                          |

## Runtime limits

The runtime provides no filesystem preopens, socket imports, environment
variables, or host callbacks beyond the small WASI preview 1 surface in
`src/wasi.ts`. Output and initial linear memory are bounded.

The wall-clock check is cooperative: it runs at WASI calls and cannot interrupt
a module stuck in a compute-only loop on the calling thread. Linear-memory
growth between WASI calls has the same limitation. Product integration must run
the module in a Web Worker and terminate that worker at the deadline. Until that
integration and cross-browser tests exist, this runtime is a local learning aid,
not the authoritative judge sandbox.

## Compiler exit criteria

Browser compilation can move from **PLANNED** only after CI proves all of the
following against a pinned native `rustc`:

1. accepted and rejected programs agree on success versus failure;
2. diagnostic codes, primary spans, and rendered messages retain teaching value;
3. emitted programs pass the same public Trial cases;
4. compiler and sysroot assets have verified BLAKE3 content IDs;
5. cold and warm load time, peak memory, and supported browsers are measured;
6. cancellation and quota exhaustion leave the editor usable;
7. the bundle build is reproducible from a documented commit and Rust version.

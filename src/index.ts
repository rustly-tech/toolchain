/**
 * `@rustly/toolchain` — browser-side Rust execution assets for Rustly.
 *
 * # What is real today
 *
 * | Piece | Status |
 * | --- | --- |
 * | WASI preview 1 runtime for `wasm32-wasip1` | **IMPLEMENTED**, tested against real rustc output |
 * | Browser capability detection and tiering | **IMPLEMENTED** |
 * | Versioned bundle manifest with BLAKE3 CIDs | **IMPLEMENTED** |
 * | In-browser Rust **compilation** | **PLANNED**, and not yet qualified |
 * | rust-analyzer in the browser | **PLANNED** |
 *
 * # The honest position on in-browser compilation
 *
 * Rustly can **run** compiled Rust in your browser today. It cannot **compile**
 * Rust in your browser, and this package does not pretend otherwise.
 *
 * Projects doing browser-side Rust compilation exist and are promising, but a
 * production claim needs qualification we have not done: reproducibility against
 * native rustc, diagnostic fidelity, bundle size on a real connection, and
 * behaviour under memory pressure. Until that work is finished, compilation
 * happens server-side and the interface says so.
 *
 * See `docs/QUALIFICATION.md` for what would have to be true.
 */

export {
  DEFAULT_LIMITS,
  Errno,
  run,
  type Limits,
  type RunOptions,
  type RunOutcome,
  type Termination,
} from './wasi.js';

export { describe, detect, tier, type Capabilities, type Tier } from './capabilities.js';

export {
  MANIFEST_VERSION,
  cacheKey,
  requiredAssets,
  validate,
  type Asset,
  type AssetRole,
  type BundleManifest,
  type ManifestProblem,
  type Toolchain,
} from './manifest.js';

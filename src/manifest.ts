/**
 * The versioned toolchain asset manifest.
 *
 * Browser toolchain assets are large — tens of megabytes — so they are cached
 * hard and fetched rarely. That makes integrity and reproducibility matter more
 * than usual: a corrupted or substituted asset would be cached for a long time
 * and would be very hard to notice.
 *
 * So every asset carries a BLAKE3 CID, exactly as in the data plane, and every
 * bundle records the exact toolchain that produced it. Reproducibility here is
 * not an aspiration; it is what lets anyone check that a published bundle is
 * what its manifest claims.
 */

/** Manifest format version. Independent of any package version. */
export const MANIFEST_VERSION = 1;

/** What an asset is for. */
export type AssetRole =
  /** The Rust standard library sysroot for the target. */
  | 'sysroot'
  /** A compiled analysis engine, e.g. rust-analyzer as WebAssembly. */
  | 'analyzer'
  /** A compiled Rust compiler, if and when one is qualified. */
  | 'compiler'
  /** Supporting data: metadata indexes, documentation blobs. */
  | 'support';

/** One downloadable asset. */
export interface Asset {
  /** Stable name within the bundle. */
  name: string;
  role: AssetRole;
  /** BLAKE3 content identifier, `b3:` followed by 64 lowercase hex characters. */
  cid: string;
  /** Size in bytes, so a download can show progress and be sanity-checked. */
  bytes: number;
  /** Media type, advisory. */
  mediaType: string;
  /** Path relative to the bundle root. */
  path: string;
  /** Whether the runtime must have this asset to function. */
  required: boolean;
}

/** The toolchain a bundle was built from and targets. */
export interface Toolchain {
  /** Exact rustc version, e.g. `1.88.0`. Never a channel name. */
  rustc: string;
  /** Target triple, e.g. `wasm32-wasip1`. */
  target: string;
  /** Rust edition the bundle assumes. */
  edition: string;
  /** Commit of the toolchain repository that produced the bundle. */
  builtFrom: string;
}

/** A complete bundle manifest. */
export interface BundleManifest {
  manifestVersion: number;
  /** Bundle version, SemVer. */
  version: string;
  toolchain: Toolchain;
  assets: Asset[];
  /** ISO 8601 build timestamp. */
  builtAt: string;
  /** Total bytes across every asset. */
  totalBytes: number;
}

/** Why a manifest was rejected. */
export interface ManifestProblem {
  field: string;
  message: string;
}

const CID_PATTERN = /^b3:[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
// An exact version, never a channel. "stable" moves, and a bundle built from a
// moving channel cannot be reproduced later.
const RUSTC_PATTERN = /^\d+\.\d+\.\d+$/;

/**
 * Validate a manifest.
 *
 * Returns every problem rather than the first, because a bundle build is slow
 * and finding one error at a time is miserable.
 */
export function validate(manifest: BundleManifest): ManifestProblem[] {
  const problems: ManifestProblem[] = [];
  const problem = (field: string, message: string) => problems.push({ field, message });

  if (manifest.manifestVersion !== MANIFEST_VERSION) {
    problem(
      'manifestVersion',
      `expected ${String(MANIFEST_VERSION)}, got ${String(manifest.manifestVersion)}`,
    );
  }
  if (!SEMVER_PATTERN.test(manifest.version)) {
    problem('version', `must be SemVer, got ${JSON.stringify(manifest.version)}`);
  }
  if (!RUSTC_PATTERN.test(manifest.toolchain.rustc)) {
    problem(
      'toolchain.rustc',
      'must be an exact version such as 1.88.0, never a channel: a bundle built from a moving channel cannot be reproduced',
    );
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.toolchain.builtFrom)) {
    problem('toolchain.builtFrom', 'must be a full 40-character commit SHA');
  }
  if (manifest.assets.length === 0) {
    problem('assets', 'a bundle must contain at least one asset');
  }
  if (!manifest.assets.some((asset) => asset.required)) {
    problem('assets', 'a bundle must contain at least one required asset');
  }

  const names = new Set<string>();
  let total = 0;
  for (const asset of manifest.assets) {
    const where = `assets[${asset.name}]`;
    if (names.has(asset.name)) problem(where, 'duplicate asset name');
    names.add(asset.name);

    if (!CID_PATTERN.test(asset.cid)) {
      problem(`${where}.cid`, 'must be b3: followed by 64 lowercase hex characters');
    }
    if (!Number.isInteger(asset.bytes) || asset.bytes <= 0) {
      problem(`${where}.bytes`, 'must be a positive integer');
    }
    if (asset.path.startsWith('/') || asset.path.includes('..')) {
      problem(`${where}.path`, 'must be a relative path inside the bundle');
    }
    total += asset.bytes;
  }

  if (manifest.totalBytes !== total) {
    problem(
      'totalBytes',
      `declared ${String(manifest.totalBytes)}, assets sum to ${String(total)}`,
    );
  }
  if (Number.isNaN(Date.parse(manifest.builtAt))) {
    problem('builtAt', 'must be an ISO 8601 timestamp');
  }
  return problems;
}

/** Assets that must be present before the runtime can start. */
export function requiredAssets(manifest: BundleManifest): Asset[] {
  return manifest.assets.filter((asset) => asset.required);
}

/**
 * The cache key for a bundle.
 *
 * Includes the rustc version and target, not only the bundle version: two
 * bundles built from different toolchains are different artifacts, and serving
 * one where the other is expected is a silent correctness bug.
 */
export function cacheKey(manifest: BundleManifest): string {
  const { rustc, target } = manifest.toolchain;
  return `rustly-toolchain:${manifest.version}:${rustc}:${target}`;
}

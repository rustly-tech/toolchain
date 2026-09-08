/**
 * What this browser can actually do.
 *
 * Detected by trying, never by parsing a user-agent string. A user-agent tells
 * you what a browser claims to be; a feature test tells you what it does, and
 * only the second one is useful for deciding whether to load a 20 MB toolchain.
 */

/** What a browser supports. */
export interface Capabilities {
  /** WebAssembly at all. Without it there is no local execution. */
  webAssembly: boolean;
  /** Streaming compilation, which avoids buffering a whole module. */
  streamingCompilation: boolean;
  /** Bulk memory operations, which the Rust toolchain emits by default. */
  bulkMemory: boolean;
  /** SIMD. Not required; some optimised builds want it. */
  simd: boolean;
  /** Origin Private File System, for caching large assets across sessions. */
  opfs: boolean;
  /** IndexedDB, the fallback asset cache. */
  indexedDb: boolean;
  /** Web Workers, so execution does not block the interface. */
  workers: boolean;
  /** SharedArrayBuffer, which needs cross-origin isolation. */
  sharedArrayBuffer: boolean;
  /** Whether the page is cross-origin isolated. */
  crossOriginIsolated: boolean;
}

/** What Rustly can offer in a given browser. */
export type Tier =
  /** Everything: run locally, cache assets, keep the interface responsive. */
  | 'full'
  /** Can run, but assets are re-fetched each session. */
  | 'no-persistence'
  /** Can run, but on the main thread. */
  | 'blocking'
  /** Cannot run locally. Everything goes to the server. */
  | 'remote-only';

function has(probe: () => boolean): boolean {
  try {
    return probe();
  } catch {
    return false;
  }
}

/** Probe the current environment. */
export function detect(): Capabilities {
  const globalScope = globalThis as Record<string, unknown>;

  return {
    webAssembly: has(
      () => typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
    ),
    streamingCompilation: has(() => typeof WebAssembly.instantiateStreaming === 'function'),
    // Probe by validating a module that uses the feature, rather than guessing
    // from a version number.
    bulkMemory: has(() =>
      WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 5, 3, 1, 0, 1, 10, 14, 1, 12, 0, 65, 0, 65, 0, 65, 0, 252,
          10, 0, 0, 11,
        ]),
      ),
    ),
    simd: has(() =>
      WebAssembly.validate(
        new Uint8Array([
          0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0,
          253, 15, 253, 98, 11,
        ]),
      ),
    ),
    opfs: has(
      () =>
        typeof navigator !== 'undefined' && typeof navigator.storage.getDirectory === 'function',
    ),
    indexedDb: has(() => typeof globalScope['indexedDB'] !== 'undefined'),
    workers: has(() => typeof globalScope['Worker'] === 'function'),
    sharedArrayBuffer: has(() => typeof globalScope['SharedArrayBuffer'] === 'function'),
    crossOriginIsolated: has(() => globalScope['crossOriginIsolated'] === true),
  };
}

/**
 * What to offer, given what is available.
 *
 * Deliberately conservative: a browser that cannot run WebAssembly gets
 * `remote-only` and a working site, not a broken editor and an apology.
 */
export function tier(capabilities: Capabilities = detect()): Tier {
  if (!capabilities.webAssembly || !capabilities.bulkMemory) return 'remote-only';
  if (!capabilities.workers) return 'blocking';
  if (!capabilities.opfs && !capabilities.indexedDb) return 'no-persistence';
  return 'full';
}

/** A short, honest sentence for the interface. */
export function describe(tier: Tier): string {
  switch (tier) {
    case 'full':
      return 'Running locally in your browser. Nothing leaves this page until you submit.';
    case 'no-persistence':
      return 'Running locally, but this browser cannot cache the toolchain, so it is re-fetched each session.';
    case 'blocking':
      return 'Running locally on the main thread; the page may pause briefly while your program runs.';
    case 'remote-only':
      return 'This browser cannot run Rust locally, so checks and runs happen on our servers.';
  }
}

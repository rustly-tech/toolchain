import { describe, expect, it } from 'vitest';

import { describe as describeTier, tier, type Capabilities } from '../src/capabilities.js';

const full: Capabilities = {
  webAssembly: true,
  streamingCompilation: true,
  bulkMemory: true,
  simd: true,
  opfs: true,
  indexedDb: true,
  workers: true,
  sharedArrayBuffer: true,
  crossOriginIsolated: true,
};

describe('capability tiers', () => {
  it.each([
    [full, 'full'],
    [{ ...full, opfs: false, indexedDb: false }, 'no-persistence'],
    [{ ...full, workers: false }, 'blocking'],
    [{ ...full, webAssembly: false }, 'remote-only'],
    [{ ...full, bulkMemory: false }, 'remote-only'],
  ] as const)('maps capabilities to %s', (capabilities, expected) => {
    expect(tier(capabilities)).toBe(expected);
  });

  it('gives every tier a user-facing explanation', () => {
    for (const value of ['full', 'no-persistence', 'blocking', 'remote-only'] as const) {
      expect(describeTier(value).length).toBeGreaterThan(20);
    }
  });
});

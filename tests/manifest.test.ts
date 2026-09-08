import { describe, expect, it } from 'vitest';

import {
  MANIFEST_VERSION,
  cacheKey,
  requiredAssets,
  validate,
  type BundleManifest,
} from '../src/manifest.js';

const valid = (): BundleManifest => ({
  manifestVersion: MANIFEST_VERSION,
  version: '0.1.0',
  toolchain: {
    rustc: '1.98.0',
    target: 'wasm32-wasip1',
    edition: '2024',
    builtFrom: 'a'.repeat(40),
  },
  assets: [
    {
      name: 'runtime',
      role: 'support',
      cid: `b3:${'b'.repeat(64)}`,
      bytes: 42,
      mediaType: 'application/wasm',
      path: 'assets/runtime.wasm',
      required: true,
    },
  ],
  builtAt: '2026-09-08T00:00:00Z',
  totalBytes: 42,
});

describe('bundle manifests', () => {
  it('accepts a content-addressed, exactly-versioned bundle', () => {
    expect(validate(valid())).toEqual([]);
    expect(requiredAssets(valid())).toHaveLength(1);
    expect(cacheKey(valid())).toBe('rustly-toolchain:0.1.0:1.98.0:wasm32-wasip1');
  });

  it('reports independent integrity and reproducibility failures together', () => {
    const manifest = valid();
    const [asset] = manifest.assets;
    if (!asset) throw new Error('test fixture has no asset');
    manifest.manifestVersion = 2;
    manifest.toolchain.rustc = 'stable';
    manifest.toolchain.builtFrom = 'short';
    asset.cid = 'sha256:not-a-cid';
    asset.path = '../escape.wasm';
    manifest.totalBytes = 0;

    expect(validate(manifest).map(({ field }) => field)).toEqual([
      'manifestVersion',
      'toolchain.rustc',
      'toolchain.builtFrom',
      'assets[runtime].cid',
      'assets[runtime].path',
      'totalBytes',
    ]);
  });

  it('requires at least one uniquely named required asset', () => {
    const manifest = valid();
    const [asset] = manifest.assets;
    if (!asset) throw new Error('test fixture has no asset');
    manifest.assets.push({ ...asset, required: false });
    asset.required = false;
    manifest.totalBytes = 84;

    const problems = validate(manifest);
    expect(problems).toContainEqual({
      field: 'assets',
      message: 'a bundle must contain at least one required asset',
    });
    expect(problems.some(({ message }) => message === 'duplicate asset name')).toBe(true);
  });
});

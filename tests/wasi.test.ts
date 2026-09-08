import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { run } from '../src/wasi.js';

const fixture = async (name: string): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = await readFile(fileURLToPath(new URL(`fixtures/${name}.wasm`, import.meta.url)));
  return new Uint8Array(bytes);
};

describe('WASI runtime', () => {
  it('runs genuine rustc output with stdin, argv, stdout, and stderr', async () => {
    const outcome = await run(await fixture('io'), {
      stdin: 'borrowed\n',
      args: ['ownership', 'moves'],
    });

    expect(outcome.termination).toEqual({ kind: 'exited', code: 0 });
    expect(outcome.stdout).toBe('args=ownership,moves\nstdin=borrowed\n');
    expect(outcome.stderr).toBe('stderr=ready\n');
    expect(outcome.outputTruncated).toBe(false);
  });

  it('preserves a non-zero process exit', async () => {
    const outcome = await run(await fixture('exit'));
    expect(outcome.termination).toEqual({ kind: 'exited', code: 7 });
  });

  it('cuts output at the configured byte limit', async () => {
    const outcome = await run(await fixture('output'), { limits: { outputBytes: 31 } });
    expect(outcome.termination).toEqual({ kind: 'limit', limit: 'output' });
    expect(new TextEncoder().encode(outcome.stdout)).toHaveLength(31);
    expect(outcome.outputTruncated).toBe(true);
  });

  it('does not expose the host filesystem', async () => {
    const outcome = await run(await fixture('filesystem'));
    expect(outcome.termination).toEqual({ kind: 'exited', code: 0 });
    expect(outcome.stdout).toMatch(/^filesystem unavailable:/);
    expect(outcome.stdout).not.toContain('unexpectedly opened');
  });

  it('refuses a module whose initial memory already exceeds the limit', async () => {
    const outcome = await run(await fixture('io'), { limits: { memoryBytes: 64 * 1024 } });
    expect(outcome.termination).toEqual({ kind: 'limit', limit: 'memory' });
  });

  it('rejects malformed modules and modules without WASI entry points', async () => {
    await expect(run(new Uint8Array([0, 1, 2]))).rejects.toThrow('cannot run here');
    const emptyModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
    await expect(run(emptyModule)).rejects.toThrow('does not export its memory');
  });
});
